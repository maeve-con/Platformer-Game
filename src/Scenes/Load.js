class Load extends Phaser.Scene {
    constructor() {
        super("Load");
    }

    preload() {
        // Tilemaps
        this.load.setPath("./assets/Tilemap/");
        this.load.tilemapTiledJSON("level-1", "level1.tmj");
        this.load.image("tilemap_packed", "tilemap_packed.png");

        // PCharacter frames
        this.load.setPath("./assets/Characters/");
        this.load.image("frame1", "tile_0045.png");
        this.load.image("frame2", "tile_0046.png");

        // Particles 
        this.load.setPath("./assets/Particles/");

        // Audio
        this.load.setPath("./assets/Audio/");
        
    }

    create() {
        // idle animation
        this.anims.create({
            key: 'player-idle',
            frames: [{key: "frame1"}],
            frameRate: 1,
            repeat: -1
        });

        // walk animation
        this.anims.create({
            key: 'player-walk',
            frames: [
                {key: "frame2"},
                {key: "frame1"}
            ],
            frameRate: 10,
            repeat: -1
        });

        // jump animation
        this.anims.create({
            key: 'player-jump',
            frames: [{key: "frame2"}],
            frameRate: 1,
            repeat: -1
        });

        this.scene.start("Platformer");
    }
}