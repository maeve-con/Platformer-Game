class Title extends Phaser.Scene {
    constructor() {
        super("Title");
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this.cameras.main.setBackgroundColor("#081b2c");

        this.add.text(W / 2, H * 0.18,
            "THE CLIMB",
            {
                fontFamily: "monospace",
                fontSize: "64px",
                color: "#f1c40f",
                stroke: "#000000",
                strokeThickness: 8
            }
        ).setOrigin(0.5);

        this.add.text(W / 2, H * 0.32,
            "Move the player with arrows or WASD",
            { fontFamily: "monospace", fontSize: "20px", color: "#ffffff" }
        ).setOrigin(0.5);

        this.add.text(W / 2, H * 0.38,
            "Walk to 'Start Button' to start game",
            { fontFamily: "monospace", fontSize: "18px", color: "#9fd6ff" }
        ).setOrigin(0.5);

        this.startButton = this.add.text(W / 2, H * 0.62,
            "[ START ]",
            {
                fontFamily: "monospace",
                fontSize: "36px",
                color: "#62dd99",
                backgroundColor: "#0d2230",
                padding: { x: 18, y: 12 }
            }
        ).setOrigin(0.5).setInteractive({ useHandCursor: true });

        this.startButton.on("pointerover", () => this.startButton.setColor("#ffffff"));
        this.startButton.on("pointerout",  () => this.startButton.setColor("#62dd99"));
        this.startButton.on("pointerdown", () => this.startGame());

        this.startKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });

        this.titlePlayer = this.physics.add.sprite(W / 2, H * 0.82, "char-idle")
            .setScale(1.5)
            .setCollideWorldBounds(true);

        this.titlePlayer.body.setAllowGravity(false);
        this.titlePlayer.anims.play("player-idle");
        this.titlePlayer.setDepth(5);

        this.playerInstruction = this.add.text(W / 2, H * 0.5,
            "Guide the hero to the button before starting.",
            { fontFamily: "monospace", fontSize: "20px", color: "#ffffff" }
        ).setOrigin(0.5);

        this.hoverPrompt = this.add.text(W / 2, H * 0.72,
            "Press E to start",
            {
                fontFamily: "monospace",
                fontSize: "18px",
                color: "#ffffff",
                backgroundColor: "rgba(0, 0, 0, 0.7)",
                padding: { x: 10, y: 8 }
            }
        ).setOrigin(0.5).setVisible(false);

        this.startZone = this.add.zone(W / 2, H * 0.62, this.startButton.width, this.startButton.height)
            .setOrigin(0.5);
        this.physics.world.enable(this.startZone);
        this.startZone.body.setAllowGravity(false);
        this.startZone.body.setImmovable(true);
    }

    update() {
        if (!this.titlePlayer) return;

        const cursors = this.input.keyboard.createCursorKeys();
        const speed = MOVE_SPEED;
        let vx = 0;
        let vy = 0;

        if (cursors.left.isDown || this.wasd.left.isDown) vx = -speed;
        else if (cursors.right.isDown || this.wasd.right.isDown) vx = speed;

        if (cursors.up.isDown || this.wasd.up.isDown) vy = -speed;
        else if (cursors.down.isDown || this.wasd.down.isDown) vy = speed;

        this.titlePlayer.setVelocity(vx, vy);

        if (vx !== 0 || vy !== 0) {
            this.titlePlayer.anims.play("player-walk", true);
            this.titlePlayer.setFlipX(vx < 0);
        } else {
            this.titlePlayer.anims.play("player-idle", true);
        }

        const isOverButton = this.physics.overlap(this.titlePlayer, this.startZone);
        this.hoverPrompt.setVisible(isOverButton);

        if (isOverButton) {
            this.startButton.setStyle({ backgroundColor: "#1a4b3d" });
            if (Phaser.Input.Keyboard.JustDown(this.startKey)) {
                this.startGame();
            }
        } else {
            this.startButton.setStyle({ backgroundColor: "#0d2230" });
        }
    }

    startGame() {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => {
            this.scene.start("Platformer", {
                level: 1,
                lives: 3,
                score: 0,
                abilities: {
                    doubleJump: false,
                    wallJump: false
                }
            });
        });
    }
}
