const MOVE_SPEED           = 200;
const JUMP_VELOCITY        = 500;
const DOUBLE_JUMP_VELOCITY = 400;
const WALL_JUMP_VX         = 280;
const WALL_JUMP_VY         = 400;
const CAM_LERP_X           = 0.1;
const CAM_LERP_Y           = 0.1;


class Platformer extends Phaser.Scene {
    constructor() {
        super("Platformer");
    }

    // receives data passed from scene.start()
    init(data) {
        this.currentLevel  = data.level || 1;
        this.lives         = data.lives !== undefined ? data.lives : 3;
        this.score         = data.score || 0;
        this.hasKey        = false;
        this.levelComplete = false;
        this.isDying       = false;

        this.abilities = data.abilities || {
            doubleJump: false,
            wallJump: false
        };
    }

    create(){
        const mapKey = `level-${this.currentLevel}`;
        const map = this.make.tilemap({key: mapKey});
        const tileset = map.addTilesetImage("kenny_tilemap_packed", "tilemap_packed");

        // world/camera bounds
        const wolrdW = map.widthInPixels;
        const worldH = map.heightInPixels;
        this.physics.world.setBounds(0, 0, wolrdW, worldH);
        this.cameras.main.setBounds(0, 0, wolrdW, worldH);

        // tile layers
        this.groundLayer = map.createLayer("Ground-n-Platforms", tileset, 0, 0);
        this.ladderLayer = map.createLayer("Ladders", tileset, 0, 0);
        this.groundLayer.setCollisionByProperty({collides: true});

        this.spikeLayer = map.createLayer("Spikes", tileset, 0, 0);

        let playerStartX = 100;
        let playerStartY = worldH - 100;

        // objects
        const objectLayer = map.getObjectLayer("Objects");
        my.sprite.coins   = this.physics.add.staticGroup();
        my.sprite.keys    = this.physics.add.staticGroup();
        my.sprite.springs = this.physics.add.staticGroup();
        this.doorSprite   = null;

        // places objects
        if(objectLayer) {
            objectLayer.objects.forEach(obj => {
                // center things
                const cx = obj.x + obj.width / 2;
                const cy = obj.y - obj.height / 2;

                switch(obj.name) {
                    case "PlayerStart":
                        playerStartX = obj.x;
                        playerStartY = obj.y;
                        break;
                    
                    case "coin":
                        const coinFrame = obj.gid - 1;
                        const coin = my.sprite.coins.create(cx, cy, "tilemap_packed").setFrame(coinFrame).setScale(SCALE);

                        this.tweens.add({
                            targets:  coin,
                            y:        cy - 4,
                            duration: 700 + Math.random() * 200,
                            yoyo:     true,
                            repeat:   -1,
                            ease:     "Sine.easeInOut"
                        });
                        break;

                    case "key":
                        const key = my.sprite.keys.create(cx, cy, "tilemap_packed").setFrame(obj.gid - 1).setScale(SCALE);

                        this.tweens.add({
                            targets:  key,
                            y:        cy - 5,
                            duration: 900,
                            yoyo:     true,
                            repeat:   -1,
                            ease:     "Sine.easeInOut"
                        });
                        break;

                    case "spring":
                        const spring = my.sprite.springs.create(cx, cy, "tilemap_packed").setFrame(obj.gid - 1).setScale(SCALE);
                        spring.setImmovable(true);
                        spring.refreshBody();
                        break;

                    case "Door":
                        this.doorSprite = this.physics.add.sprite(cx, cy, "tilemap_packed").setFrame(obj.gid - 1).setScale(SCALE);
                        this.doorSprite.body.allowGravity = false;
                        this.doorSprite.body.moves = false;
                        this.doorSprite.setAlpha(0.4);
                        break;
                }
            });
        }

        // Player info
        my.sprite.player = this.physics.add.sprite(playerStartX, playerStartY, "characters", 0).setScale(SCALE).setCollideWorldBounds(false);
        //my.sprite.player.body.setSize(12, 20);
        my.sprite.player.setDepth(10);
        my.sprite.player.canDoubleJump   = this.abilities.doubleJump;
        my.sprite.player.canWallJump     = this.abilities.wallJump;
        my.sprite.player.hasDoubleJumped = false;
        my.sprite.player.wallJumped      = false;
        my.sprite.player.isOnLadder      = false;
        my.sprite.player.wasOnGround     = false;
        my.sprite.player.coyoteTimer     = 0;
        my.sprite.player.jumpBuffer      = 0;

        // Physics - colliders and overlaps
        // checks if player touches coins
        this.physics.add.collider(my.sprite.player, this.groundLayer);      // ground collision
        this.physics.add.overlap(
            my.sprite.player,   // obj1
            my.sprite.coins,    // obj2
            this.collectCoin,   // callback
            null,               // processCallback
            this                // context - refers to inside collectCoin
        );

        // check if player touches key
        this.physics.add.overlap(
            my.sprite.player,
            my.sprite.keys,
            this.collectKey,
            null,
            this
        );

        // checks if player touches springs
        this.physics.add.overlap(
            my.sprite.player,
            my.sprite.springs,
            (player, spring) => {
                if (player.body.velocity.y > 0) {
                    player.body.setVelocityY(-700);
                    this.emitJumpParticles(player.x, player.y + 10, true);
                }
            }
        );

        // check if player touches spikes
        this.physics.add.overlap(
            my.sprite.player, this.spikeLayer,
            () => {this.playerDie();}
        );

        // checks if player can complete level when touching door
        if (this.doorSprite) {
            this.physics.add.overlap(
                my.sprite.player,
                this.doorSprite,
                () => {
                    if (this.hasKey && !this.levelComplete) this.completeLevel();
                }
            );
        }

        // Particles
        // running
        my.vfx.moveTrail = this.add.particles(0, 0, "kenny-particles", {
            frame: ["dirt_01.png", "dirt_02.png", "dirt_03.png"],
            speed: {min: 10, max: 40},
            angle: {min: 160, max: 200},
            scale: {start: 0.12, end: 0},
            alpha: {start: 0.8, end: 0},
            lifespan: {min: 120, max: 250},
            frequency: -1,
        });

        // jump/land
        my.vfx.jumpBurst = this.add.particles(0, 0, "kenny-particles", {
            frame: ["star_01.png", "star_02.png", "star_03.png"],
            speed: {min: 60, max: 160},
            angle: {min: 0, max: 360},
            scale: {start: 0.20, end: 0},
            alpha: {start: 1, end: 0},
            lifespan: {min: 250, max: 500},
            frequency: -1,
        });

        // collect burst
        my.vfx.collectBurst = this.add.particles(0, 0, "star_01", {
            speed: { min: 80, max: 200 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.2, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 300, max: 600 },
            frequency: -1,
        });

        // Input
        cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up:    Phaser.Input.Keyboard.KeyCodes.W,
            down:  Phaser.Input.Keyboard.KeyCodes.S,
            left:  Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        // HUD
        this.scoreText = this.add.text(16, 16, `Score: ${this.score}`, {
            fontFamily: "minospace",
            fontSize: "18px",
            color: "#ffffff"
        }).setScrollFactor(0).setDepth(99);

        this.livesText = this.add.text(16, 40, `Lives: ${this.lives}`, {
            fontFamily: "minospace",
            fontSize: "18px",
            color: "#ffffff"
        }).setScrollFactor(0).setDepth(99);

        this.keyText = this.add.text(16, 64, "Key: X", {
            fontFamily: "minospace",
            fontSize: "18px",
            color: "#ffffff"
        }).setScrollFactor(0).setDepth(99);

        this.levelTextx = this.add.text(this.scale.width - 16, 16, `Level: ${this.currentLevel}`, {
            fontFamily: "minospace",
            fontSize: "18px",
            color: "#ffffff"
        }).setOrigin(1).setScrollFactor(0).setDepth(99);

        // Helpers
        this.prevOnGround = true;
        this.cameras.main.fadeIn(500, 0, 0, 0);
        this.cameras.main.startFollow(my.sprite.player, true, CAM_LERP_X, CAM_LERP_Y);
        this.cameras.main.setBounds(0, 0, wolrdW, worldH);
    }

    update(time, delta) {
        // stop updating if the player dies or the level completes
        if(!my.sprite.player || this.levelComplete || this.isDying) return;     

        const player = my.sprite.player;
        const body = player.body;
        const onGround = body.blocked.down;
        const onWallLeft = body.blocked.left;
        const onWallRight = body.blocked.right;

        const goLeft  = cursors.left.isDown || this.wasd.left.isDown;
        const goRight = cursors.right.isDown || this.wasd.right.isDown;
        const goUp    = cursors.up.isDown || this.wasd.up.isDown;
        const goDown  = cursors.down.isDown || this.wasd.down.isDown;
        const jumpJustPressed = Phaser.Input.Keyboard.JustDown(cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.up);

        // ladder
        const wasOnLadder = player.isOnLadder;
        player.isOnLadder = false;
        if(wasOnLadder && !player.isOnLadder) {
            player.body.setAllowGravity(true);
        }
        this.physics.overlap(player, this.ladderLayer, () => {
            if (goUp || goDown) player.isOnLadder = true;
        });

        // coyote & jump buffer timers
        if(onGround) {
            player.coyoteTimer = 80;
            player.hasDoubleJumped = false;
            player.wallJumped = false;
        }
        else {
            player.coyoteTimer = Math.max(0, player.coyoteTimer - delta);
        }

        if(jumpJustPressed) {
            player.jumpBuffer = 120;
        }
        else {
            player.jumpBuffer = Math.max(0, player.jumpBuffer - delta);
        }

        const justLanded = !this.prevOnGround && onGround;
        if(justLanded) {
            this.emitJumpParticles(player.x, player.y + 10, false);
        }

        // Wall sliding
        let isWallSliding = false;
        let wallDir = 0;
        if(!onGround && player.canWallJump) {
            if(goLeft && onWallLeft && body.velocity.y > 0) {
                isWallSliding = true;
                wallDir = -1;
            }
            if(goRight && onWallRight && body.velocity.y > 0) {
                isWallSliding = true;
                wallDir = 1;
            }
        }
        if(isWallSliding) {
            if(body.velocity.y > 50) {
                body.setVelocityY(50);
            }
        }

        // Jumps
        if(player.jumpBuffer > 0) {
            if(player.coyoteTimer > 0){
                // normal
                this.doJump(player, -JUMP_VELOCITY);
                player.coyoteTimer = 0;
                player.jumpBuffer = 0;
            }
            else if(isWallSliding && player.canWallJump && !player.wallJumped){
                // walljump
                player.wallJumped = true;
                player.hasDoubleJumped = false;
                body.setVelocityX(-wallDir * WALL_JUMP_VX);
                this.doJump(player, -WALL_JUMP_VY);
                player.jumpBuffer = 0;
            }
            else if(player.canDoubleJump && !onGround && !player.hasDoubleJumped && player.coyoteTimer <= 0) {
                player.hasDoubleJumped = true;
                this.doJump(player, -DOUBLE_JUMP_VELOCITY);
                this.emitDoubleJumpParticles(player.x, player.y);
            }
        }        


        // Basic Movement
        if(goLeft) {
            body.setVelocityX(-MOVE_SPEED);
            player.setFlipX(true);
            player.anims.play("player-walk", true);
        }
        else if(goRight) {
            body.setVelocityX(MOVE_SPEED);
            player.setFlipX(false);
            player.anims.play("player-walk", true);
        }
        else {
            // decelerate slower if player is in air than on ground
            body.setVelocityX(body.velocity.x * (onGround ? 0.75 : 0.9))
            if(Math.abs(body.velocity.x) < 5){
                body.setVelocityX(0);
            }
            if(onGround){
                player.anims.play("player-idle", true);
            }
        }

        if(onGround && Math.abs(body.velocity.x) > 60) {
            my.vfx.moveTrail.emitParticleAt(player.x, player.y + 10, 1);
        }

        if(!onGround) player.anims.play("player-jump", true);

        // HUD refresh
        this.scoreText.setText(`Score: ${this.score}`);
        this.livesText.setText(`Lives: ${this.lives}`);

        this.prevOnGround = onGround;   // update character state
        
        if(player.y > this.physics.world.bounds.height + 50) {
            this.playerDie();
        }
    }

    // FUNCTIONS 
    // Jump 
    doJump(player, vy) {
        player.body.setVelocityY(vy);
        this.emitJumpParticles(player.x, player.y + 10, true);
    }

    // Particles
    emitJumpParticles(x, y, isJump) {
        my.vfx.jumpBurst.emitParticleAt(x - 6, y, 5);
        my.vfx.jumpBurst.emitParticleAt(x + 6, y, 5);
    }
    emitDoubleJumpParticles(x, y) {
        my.vfx.jumpBurst.emitParticleAt(x, y, 15);
    }

    collectCoin(player, coin) {
        coin.destroy();
        this.score += 100;
        my.vfx.collectBurst.emitParticleAt(coin.x, coin.y, 8);
    }

    collectKey(player, key) {
        key.destroy();
        this.hasKey = true;
        my.vfx.collectBurst.emitParticleAt(key.x, key.y, 8);
        this.keyText.setText("Key: ✓").setColor("#ffbb00");

        if(this.doorSprite) {
            this.doorSprite.setAlpha(1);
            this.tweens.add({
                targets: this.doorSprite,
                y: this.doorSprite.y - 4,
                duration: 500,
                yoyo: true,
                repeat: -1,
                ease: "Sine.easeInOut"
            });
        }
    }

    completeLevel() {
        this.levelComplete = true;
        this.score += 500;
        
        // dims screen for completion text
        this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            this.scale.width,
            this.scale.height,
            0x000000, 0.6
        ).setScrollFactor(0).setDepth(100);

        this.add.text(
            this.scale.width / 2,
            this.scale.height / 2 - 60,
            "LEVEL COMPLETE!",
            {
                fontFamily: "monospace",
                fontSize:   "48px",
                color:      "#f1c40f"
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        this.add.text(
            this.scale.width / 2,
            this.scale.height / 2,
            `Score: ${this.score}`,
            {
                fontFamily: "monospace",
                fontSize:   "28px",
                color:      "#f1c40f"
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        // next level button
        const button = this.add.text(
            this.scale.width / 2,
            this.scale.height / 2 + 60,
            "[ NEXT LEVEL ]",
            {
                fontFamily: "monospace",
                fontSize:   "32px",
                color:      "#f1c40f"
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100).setInteractive();

        // hover fx
        button.on("pointerover", () => button.setColor("#ffffff"));
        button.on("pointerout", () => button.setColor("#62dd99"));

        button.on("pointerdown", () => {
            const nextLevel = this.currentLevel + 1;

            if(nextLevel > 3) {
                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.cameras.main.once("camerafadeoutcomplete", () => {
                    this.showEndScreen();
                });
            }
            else {
                const abilities = {...this.abilities}   // copy abilities rather than reference
                if(nextLevel >= 2) abilities.doubleJump = true;
                if(nextLevel >= 3) abilities.wallJump = true;

                this.cameras.main.fadeOut(500, 0, 0, 0);
                this.cameras.main.once("camerafadeoutcomplete", () => {
                    this.scene.start("Platformer", {
                        level: nextLevel,
                        lives: this.lives,
                        score: this.score,
                        abilities: abilities
                    });
                });
            }
        });
    }

    showEndScreen() {
        this.add.rectangle(
            this.scale.width / 2,
            this.scale.height / 2,
            this.scale.width,
            this.scale.height,
            0x000000, 0.6
        ).setScrollFactor(0).setDepth(100);

        this.add.text(
            this.scale.width / 2,
            this.scale.height / 2 - 60,
            "YOU WIN!",
            {
                fontFamily: "monospace",
                fontSize:   "56px",
                color:      "#f1c40f"
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        this.add.text(
            this.scale.width / 2,
            this.scale.height / 2,
            `Final Score: ${this.score}`,
            {
                fontFamily: "monospace",
                fontSize:   "28px",
                color:      "#f1c40f"
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        // next level button
        const button = this.add.text(
            this.scale.width / 2,
            this.scale.height / 2 + 60,
            "[ PLAY AGAIN ]",
            {
                fontFamily: "monospace",
                fontSize:   "32px",
                color:      "#f1c40f"
            }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100).setInteractive();

        button.on("pointerover", () => button.setColor("#ffffff"));
        button.on("pointerout", () => button.setColor("#62dd99"));

        button.on("pointerdown", () => {
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once("camerafadeoutcomplete", () => {
                this.scene.start("Platformer", {
                    level: 1,
                    lives: 3,
                    score: 0,
                    abilities: {doubleJump: false, wallJump: false}
                });
            });
        });

        this.cameras.main.fadeIn(500, 0, 0, 0);
    }

    playerDie() {
        if(this.isDying) return;
        this.isDying = true;
        this.lives--;

        this.time.delayedCall(700, () => {
            if(this.lives <= 0) {
                this.cameras.main.fadeOut(400, 0, 0, 0);
                this.cameras.main.once("camerafadeoutcomplete", () => {
                    this.scene.start("Platformer", {
                        level: 1,
                        lives: 3,
                        score: 0,
                        abilities: {doubleJump: false, wallJump: false}
                    });
                });
            }
            else {
                this.cameras.main.fadeOut(300, 0, 0, 0);
                this.cameras.main.once("camerafadeoutcomplete", ()=> {
                    this.scene.restart({
                        level: this.currentLevel,
                        lives: this.lives,
                        score: this.score,
                        abilities: this.abilities
                    });
                });
            }
        });
    }
}