class Platformer extends Phaser.Scene {
    constructor() {
        super("Platformer");
    }

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

        // objects
        const objectLayer = map.getObjectLayer("Objects");
        my.sprite.coins   = this.physics.add.staticGroup();
        my.sprite.keys    = this.physics.add.staticGroup();
        my.sprite.springs = this.physics.add.staticGroup();
        this.doorSprite   = null;

        if(objectLayer) {
            objectLayer.objects.forEach(obj => {
                
            })
        }
    }
}