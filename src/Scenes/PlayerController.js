class PlayerController {
    constructor(scene) {
        this.scene = scene;
    }

    init() {
        const scene = this.scene;

        cursors = scene.input.keyboard.createCursorKeys();
        scene.wasd = scene.input.keyboard.addKeys({
            up:    Phaser.Input.Keyboard.KeyCodes.W,
            down:  Phaser.Input.Keyboard.KeyCodes.S,
            left:  Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        scene.prevOnGround    = true;
        scene.wallCoyoteTimer = 0;
        scene.lastWallDir     = 0;
    }

    update(delta) {
        const scene  = this.scene;
        const player = my.sprite.player;
        if (!player || !player.body) return;

        // Flicker the sprite to signal the spawn invulnerability window.
        if (player.invulnerable) {
            player.invulnTimer -= delta;
            player.setAlpha(Math.floor(player.invulnTimer / 80) % 2 === 0 ? 1 : 0.3);
            if (player.invulnTimer <= 0) {
                player.invulnerable = false;
                player.setAlpha(1);
            }
        }

        const wasd  = scene.wasd;
        const goLeft  = cursors.left.isDown  || wasd.left.isDown;
        const goRight = cursors.right.isDown || wasd.right.isDown;
        const goUp    = cursors.up.isDown    || wasd.up.isDown || cursors.space.isDown;
        const goDown  = cursors.down.isDown  || wasd.down.isDown;
        const jumpJustPressed =
            Phaser.Input.Keyboard.JustDown(cursors.space) ||
            Phaser.Input.Keyboard.JustDown(cursors.up)    ||
            Phaser.Input.Keyboard.JustDown(wasd.up);

        const body        = player.body;
        const onGround    = body.blocked.down;
        const onWallLeft  = body.blocked.left;
        const onWallRight = body.blocked.right;

        // Ladder
        const wasOnLadder = player.isOnLadder;
        player.isOnLadder = false;

        if (wasOnLadder && !player.isOnLadder) body.setAllowGravity(true);

        scene.physics.overlap(player, my.sprite.ladders, () => {
            if (goUp || goDown) player.isOnLadder = true;
        });

        if (player.isOnLadder) {
            body.setAllowGravity(false);
            body.setVelocityY(0);
            if (goUp)   { body.setVelocityY(-150); this.playLadderSound(); }
            if (goDown) { body.setVelocityY( 150); this.playLadderSound(); }
            return;
        }

        // Coyote time
        if (onGround) {
            player.coyoteTimer    = 80;
            player.hasDoubleJumped = false;
            player.wallJumped     = false;
        } else {
            player.coyoteTimer = Math.max(0, player.coyoteTimer - delta);
        }

        // Jump buffer
        // Lets the player press jump slightly before landing and still get it.
        if (jumpJustPressed) {
            player.jumpBuffer = 120;
        } else {
            player.jumpBuffer = Math.max(0, player.jumpBuffer - delta);
        }

        const justLanded = !scene.prevOnGround && onGround;
        if (justLanded) {
            scene.sound.play("land");
            scene.emitLandParticles(player.x, player.y + 10);
        }

        // Wall sliding
        let isWallSliding = false;
        let wallDir = 0;

        if (!onGround && player.canWallJump) {
            if (goLeft && onWallLeft && body.velocity.y > 0) {
                isWallSliding = true;
                wallDir = -1;
                scene.wallCoyoteTimer = 100;
                scene.lastWallDir     = -1;
            }
            if (goRight && onWallRight && body.velocity.y > 0) {
                isWallSliding = true;
                wallDir = 1;
                scene.wallCoyoteTimer = 100;
                scene.lastWallDir     = 1;
            }
        }

        if (!isWallSliding) {
            scene.wallCoyoteTimer = Math.max(0, scene.wallCoyoteTimer - delta);
        }

        // Slow descent while clinging to a wall.
        if (isWallSliding && body.velocity.y > 50) body.setVelocityY(50);

        // Jump resolution
        if (player.jumpBuffer > 0) {
            if (player.coyoteTimer > 0) {
                this.doJump(player, -JUMP_VELOCITY);
                player.coyoteTimer = 0;
                player.jumpBuffer  = 0;

            } else if ((isWallSliding || scene.wallCoyoteTimer > 0) && player.canWallJump && !player.wallJumped) {
                player.wallJumped      = true;
                player.hasDoubleJumped = false;
                const dir = isWallSliding ? wallDir : scene.lastWallDir;
                body.setVelocityX(-dir * WALL_JUMP_VX);
                this.doJump(player, -WALL_JUMP_VY);
                scene.wallCoyoteTimer = 0;
                player.jumpBuffer     = 0;

            } else if (player.canDoubleJump && !onGround && !player.hasDoubleJumped && player.coyoteTimer <= 0) {
                player.hasDoubleJumped = true;
                this.doJump(player, -DOUBLE_JUMP_VELOCITY);
                scene.emitDoubleJumpParticles(player.x, player.y);
            }
        }

        // Horizontal movement
        if (goLeft) {
            body.setVelocityX(-MOVE_SPEED);
            player.setFlipX(true);
            player.anims.play("player-walk", true);
            if (onGround && !scene.walkSoundPlaying) this.playWalkSound();

        } else if (goRight) {
            body.setVelocityX(MOVE_SPEED);
            player.setFlipX(false);
            player.anims.play("player-walk", true);
            if (onGround && !scene.walkSoundPlaying) this.playWalkSound();

        } else {
            // Faster deceleration on ground than in air.
            body.setVelocityX(body.velocity.x * (onGround ? 0.75 : 0.9));
            if (Math.abs(body.velocity.x) < 5) body.setVelocityX(0);
            if (onGround) player.anims.play("player-idle", true);
        }

        if (onGround && Math.abs(body.velocity.x) > 60) {
            my.vfx.moveTrail.emitParticleAt(player.x, player.y + 10, 2);
        }

        if (!onGround) player.anims.play("player-jump", true);

        scene.scoreText.setText(`Score: ${scene.score}`);
        scene.livesText.setText(`Lives: ${scene.lives}`);

        scene.prevOnGround = onGround;

        if (player.y > scene.physics.world.bounds.height + 50) {
            scene.playerDie();
        }
    }

    doJump(player, vy) {
        player.body.setVelocityY(vy);
        this.scene.sound.play("jump");
        this.scene.emitJumpParticles(player.x, player.y + 10);
    }

    playWalkSound() {
        const scene = this.scene;
        scene.sound.play("walk", { loop: false });
        scene.walkSoundPlaying = true;
        scene.time.delayedCall(300, () => { scene.walkSoundPlaying = false; });
    }

    playLadderSound() {
        const scene = this.scene;
        if (!scene.ladderSoundPlaying) {
            scene.sound.play("ladder");
            scene.ladderSoundPlaying = true;
            scene.time.delayedCall(300, () => { scene.ladderSoundPlaying = false; });
        }
    }
}
