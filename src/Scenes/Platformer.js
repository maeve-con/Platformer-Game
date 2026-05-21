const MOVE_SPEED           = 0;
const JUMP_VELOCITY        = 0;
const DOUBLE_JUMP_VELOCITY = 0;
const WALL_JUMP_VX         = 0;
const WALL_JUMP_VY         = 0;
const LOOKAHEAD_X          = 0;
const LOOKAHEAD_Y          = 0;
const CAM_LERP_X           = 0;
const CAM_LERP_Y           = 0;


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

        this.lookaheadX = 0;
        this.lookaheadY = 0;
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
        this.groundLayer.setCollisionsByProperty({collides: true});

        // ladder check
        this.physics.add.overlap(
            my.sprite.player,
            this.ladderLayer,
            () => {
                if(goUp || goDown) {
                    my.sprite.player.isOnLadder = true;
                }
            }
        );

        // add ladder layer for functionality



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
                        const key = my.sprite.keys.create(cx, cy, "timemap_packed").setFrame(obj.gid - 1).setScale(SCALE);

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
                        const spring = my.sprite.springs.create(cx, cy, "tilemap_packed").setFrame(obj.gid - 1).setScale(SCALE);
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
        this.physics.add.collider(my.sprite.player, this.groundLayer);      // ground collision
        this.physics.add.overlap(
            my.sprite.player,   // obj1
            my.sprite.coins,    // obj2
            this.collectCoin,   // callback
            null,               // processCallback
            this                // context - refers to inside collectCoin
        );

        this.physics.add.overlap(
            my.sprite.player,
            my.sprite.keys,
            this.collectKey,
            null,
            this
        );

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
            maxParticles: 40,
            gravityY: 120
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
            maxParticles: 16,
            blendMode: "ADD"
        });

        // wallslide
        my.vfx.wallSlide = this.add.particles(0, 0, "kenny-particles", {
            frame: ["smoke_01.png", "smoke_02.png"],
            speed: {min: 8, max: 25},
            angle: {min: 70, max: 110},
            scale: {start: 0.1, end: 0},
            alpha: {start: 0.6, end: 0},
            lifespan: {min: 200, max: 400},
            frequency: -1,
            maxParticles: 20, 
            gravityY: 40
        });

        // collect burst fx
        my.vfx.collectBurst = this.add.particles(0, 0, "kenny-particles", {
            frame: ["star_02.png", "spark_03.png", "light_01.png"],
            speed: {min: 80, max: 200},
            angle: {min: 0, max: 360},
            scale: {start: 0.3, end: 0},
            alpha: {start: 1, end: 0},
            lifespan: {min: 300, max: 700},
            frequency: -1, 
            maxParticles: 20,
            blendMode: "ADD"
        });

        // Camera
        this.camTargetX = my.sprite.player.x - this.scale.width / 2;
        this.camTargetY = my.sprite.player.y - this.scale.height / 2;
        this.cameras.main.scrollX = this.camTargetX;
        this.cameras.main.scrollY = this.camTargetY;

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
        this.dustTimer = 0;
        this.wallSlideTimer = 0;
        this.prevOnGround = true;
        this.camera.main.fadeIn(500, 0, 0, 0);
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


        let isWallSliding = false;
    }

    // FUNCTIONS 
}