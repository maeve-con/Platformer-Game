// ============================================================
//  PlayerController.js
//  Handles everything the player does each frame:
//    - reading input
//    - ladder climbing
//    - coyote time & jump buffering
//    - wall sliding & wall jumping
//    - normal / double jumping
//    - horizontal movement & animations
//    - invulnerability flicker
//    - fall-death detection
// ============================================================

class PlayerController {
    // scene  — the Platformer scene this controller lives inside
    constructor(scene) {
        this.scene = scene;
    }

    // Called once in Platformer.create() after the player sprite exists.
    // Sets up keyboard input and resets per-frame tracking state.
    init() {
        const scene = this.scene;

        cursors = scene.input.keyboard.createCursorKeys();
        scene.wasd = scene.input.keyboard.addKeys({
            up:    Phaser.Input.Keyboard.KeyCodes.W,
            down:  Phaser.Input.Keyboard.KeyCodes.S,
            left:  Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        scene.prevOnGround   = true;
        scene.wallCoyoteTimer = 0;
        scene.lastWallDir    = 0;
    }

    // Called every frame from Platformer.update().
    // delta — ms since last frame
    update(delta) {
        const scene  = this.scene;
        const player = my.sprite.player;
        if (!player || !player.body) return;

        // ── Invulnerability flicker ───────────────────────────────────
        if (player.invulnerable) {
            player.invulnTimer -= delta;
            // Alternate between full and dim alpha to signal invulnerability
            player.setAlpha(Math.floor(player.invulnTimer / 80) % 2 === 0 ? 1 : 0.3);
            if (player.invulnTimer <= 0) {
                player.invulnerable = false;
                player.setAlpha(1);
            }
        }

        // ── Read input ────────────────────────────────────────────────
        const wasd   = scene.wasd;
        const goLeft  = cursors.left.isDown  || wasd.left.isDown;
        const goRight = cursors.right.isDown || wasd.right.isDown;
        const goUp    = cursors.up.isDown    || wasd.up.isDown || cursors.space.isDown;
        const goDown  = cursors.down.isDown  || wasd.down.isDown;
        const jumpJustPressed =
            Phaser.Input.Keyboard.JustDown(cursors.space) ||
            Phaser.Input.Keyboard.JustDown(cursors.up)    ||
            Phaser.Input.Keyboard.JustDown(wasd.up);

        // ── Physics state shortcuts ───────────────────────────────────
        const body        = player.body;
        const onGround    = body.blocked.down;
        const onWallLeft  = body.blocked.left;
        const onWallRight = body.blocked.right;

        // ── Ladder ────────────────────────────────────────────────────
        const wasOnLadder = player.isOnLadder;
        player.isOnLadder = false;

        // Re-enable gravity the moment we step off a ladder
        if (wasOnLadder && !player.isOnLadder) body.setAllowGravity(true);

        scene.physics.overlap(player, my.sprite.ladders, () => {
            if (goUp || goDown) player.isOnLadder = true;
        });

        if (player.isOnLadder) {
            body.setAllowGravity(false);
            body.setVelocityY(0);
            if (goUp)   { body.setVelocityY(-150); this._playLadderSound(); }
            if (goDown) { body.setVelocityY( 150); this._playLadderSound(); }
            return; // skip all ground/jump logic while on ladder
        }

        // ── Coyote time ───────────────────────────────────────────────
        // Lets the player jump a few ms after walking off a ledge.
        if (onGround) {
            player.coyoteTimer    = 80;
            player.hasDoubleJumped = false;
            player.wallJumped     = false;
        } else {
            player.coyoteTimer = Math.max(0, player.coyoteTimer - delta);
        }

        // ── Jump buffer ───────────────────────────────────────────────
        // Lets the player press jump slightly before landing and still jump.
        if (jumpJustPressed) {
            player.jumpBuffer = 120;
        } else {
            player.jumpBuffer = Math.max(0, player.jumpBuffer - delta);
        }

        // ── Land event ────────────────────────────────────────────────
        const justLanded = !scene.prevOnGround && onGround;
        if (justLanded) {
            scene.sound.play("land");
            scene.emitLandParticles(player.x, player.y + 10);
        }

        // ── Wall sliding ──────────────────────────────────────────────
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

        // Slow descent while clinging to a wall
        if (isWallSliding && body.velocity.y > 50) body.setVelocityY(50);

        // ── Jump resolution ───────────────────────────────────────────
        if (player.jumpBuffer > 0) {

            if (player.coyoteTimer > 0) {
                // Normal jump (or coyote jump off a ledge)
                this._doJump(player, -JUMP_VELOCITY);
                player.coyoteTimer = 0;
                player.jumpBuffer  = 0;

            } else if ((isWallSliding || scene.wallCoyoteTimer > 0) && player.canWallJump && !player.wallJumped) {
                // Wall jump — kick horizontally away from the wall
                player.wallJumped      = true;
                player.hasDoubleJumped = false;
                const dir = isWallSliding ? wallDir : scene.lastWallDir;
                body.setVelocityX(-dir * WALL_JUMP_VX);
                this._doJump(player, -WALL_JUMP_VY);
                scene.wallCoyoteTimer = 0;
                player.jumpBuffer     = 0;

            } else if (player.canDoubleJump && !onGround && !player.hasDoubleJumped && player.coyoteTimer <= 0) {
                // Double jump
                player.hasDoubleJumped = true;
                this._doJump(player, -DOUBLE_JUMP_VELOCITY);
                scene.emitDoubleJumpParticles(player.x, player.y);
            }
        }

        // ── Horizontal movement ───────────────────────────────────────
        if (goLeft) {
            body.setVelocityX(-MOVE_SPEED);
            player.setFlipX(true);
            player.anims.play("player-walk", true);
            if (onGround && !scene.walkSoundPlaying) this._playWalkSound();

        } else if (goRight) {
            body.setVelocityX(MOVE_SPEED);
            player.setFlipX(false);
            player.anims.play("player-walk", true);
            if (onGround && !scene.walkSoundPlaying) this._playWalkSound();

        } else {
            // Decelerate — faster on ground than in air
            body.setVelocityX(body.velocity.x * (onGround ? 0.75 : 0.9));
            if (Math.abs(body.velocity.x) < 5) body.setVelocityX(0);
            if (onGround) player.anims.play("player-idle", true);
        }

        // Running dust trail
        if (onGround && Math.abs(body.velocity.x) > 60) {
            my.vfx.moveTrail.emitParticleAt(player.x, player.y + 10, 2);
        }

        if (!onGround) player.anims.play("player-jump", true);

        // ── HUD refresh ───────────────────────────────────────────────
        scene.scoreText.setText(`Score: ${scene.score}`);
        scene.livesText.setText(`Lives: ${scene.lives}`);

        scene.prevOnGround = onGround;

        // ── Fall out of world ─────────────────────────────────────────
        if (player.y > scene.physics.world.bounds.height + 50) {
            scene.playerDie();
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────

    _doJump(player, vy) {
        player.body.setVelocityY(vy);
        this.scene.sound.play("jump");
        this.scene.emitJumpParticles(player.x, player.y + 10);
    }

    _playWalkSound() {
        const scene = this.scene;
        scene.sound.play("walk", { loop: false });
        scene.walkSoundPlaying = true;
        scene.time.delayedCall(300, () => { scene.walkSoundPlaying = false; });
    }

    _playLadderSound() {
        const scene = this.scene;
        if (!scene.ladderSoundPlaying) {
            scene.sound.play("ladder");
            scene.ladderSoundPlaying = true;
            scene.time.delayedCall(300, () => { scene.ladderSoundPlaying = false; });
        }
    }
}
