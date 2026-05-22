class Load extends Phaser.Scene {
    constructor() {
        super("Load");
    }

    preload() {
        // Tilemaps
        this.load.setPath("./assets/Tilemap/");
        this.load.tilemapTiledJSON("level-1", "Level1.tmj");
        this.load.tilemapTiledJSON("level-2", "Level2.tmj");
        this.load.spritesheet("tilemap_packed", "tilemap_packed.png", {
            frameWidth: 18,
            frameHeight: 18
        });

        // Character sprites
        this.load.setPath("./assets/Characters/");
        this.load.image("char-idle", "tile_0045.png");
        this.load.image("char-walk", "tile_0046.png");

        // Particles 
        this.load.setPath("./assets/Particles/");
        this.load.image("dirt_01", "dirt_01.png");
        this.load.image("star_01", "star_01.png");
        this.load.image("star_08", "star_08.png");

        // Audio
        this.load.setPath("./assets/Audio/");
        this.load.audio("walk", "footstep_concrete_000.ogg");
        this.load.audio("collect", "impactBell_heavy_000.ogg");
        this.load.audio("jump", "impactWood_medium_001.ogg");
        this.load.audio("land", "footstep_wood_003.ogg");
        this.load.audio("death", "impactBell_heavy_002.ogg");
        this.load.audio("openDoor", "impactGlass_medium_001.ogg");
        this.load.audio("spring", "impactMetal_heavy_000.ogg");
        this.load.audio("ladder", "impactWood_light_001.ogg");
        
    }

    create() {
        // idle animation
        this.anims.create({
            key: 'player-idle',
            frames: [{key: "char-idle"}],
            frameRate: 1,
            repeat: -1
        });

        // walk animation
        this.anims.create({
            key: 'player-walk',
            frames: [
                {key: "char-walk"},
                {key: "char-idle"}
            ],
            frameRate: 10,
            repeat: -1
        });

        // jump animation
        this.anims.create({
            key: 'player-jump',
            frames: [{key: "char-walk"}],
            frameRate: 1,
            repeat: -1
        });

        this.scene.start("Platformer");
    }
}