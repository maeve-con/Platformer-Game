class Platformer extends Phaser.Scene {
    constructor() {
        super("Platformer");
    }

    init(data) {
        this.currentLevel       = data.level || 1;
        this.lives              = data.lives !== undefined ? data.lives : 3;
        this.score              = data.score || 0;
        this.hasKey             = false;
        this.firstCoinCollected = false;
        this.levelComplete      = false;
        this.isDying            = false;
        this.walkSoundPlaying   = false;
        this.ladderSoundPlaying = false;
        this.wallCoyoteTimer    = 0;
        this.lastWallDir        = 0;
        this.cameraReady        = false;
        this.cutsceneActive     = false;
        this.doorSprite         = null;
        this.doorCollider       = null;

        this.abilities = data.abilities || { doubleJump: false, wallJump: false };
        this.skipPan   = data.skipPan   || false;
        if (this.currentLevel === 4 && !this.skipPan) this.lives = 3;
        this.deathCamX = data.deathCamX !== undefined ? data.deathCamX : null;
        this.deathCamY = data.deathCamY !== undefined ? data.deathCamY : null;
        this.bossHp    = data.bossHp    !== undefined ? data.bossHp    : null;
    }

    create() {
        if (this.currentLevel === "win") {
            this.showEndScreen();
            return;
        }

        this.enemyManager  = new EnemyManager(this);
        this.bossManager   = new BossManager(this);
        this.levelSetup    = new LevelSetup(this, this.enemyManager, this.bossManager);
        this.playerCtrl    = new PlayerController(this);

        this.levelSetup.buildWorld();
        const { playerStartX, playerStartY } = this.levelSetup.placeObjects();
        const player = this.levelSetup.spawnPlayer(playerStartX, playerStartY);

        this.levelSetup.addColliders();
        this.levelSetup.buildParticles();
        this.levelSetup.buildHUD();

        this.playerCtrl.init();

        this.prevOnGround = true;

        this.levelSetup.runCameraPan(player);
    }

    update(time, delta) {
        if (!my.sprite.player || !my.sprite.player.body) return;
        if (this.levelComplete || this.isDying) return;

        this.enemyManager.update(delta);
        if (this.bossManager.boss && this.bossManager.boss.isAlive) {
            this.bossManager.update(delta);
        }

        if (!this.cameraReady) return;

        this.playerCtrl.update(delta);
    }

    // Particle helpers
    emitJumpParticles(x, y) {
        my.vfx.jumpBurst.emitParticleAt(x - 8, y, 6);
        my.vfx.jumpBurst.emitParticleAt(x + 8, y, 6);
    }

    emitLandParticles(x, y) {
        my.vfx.moveTrail.emitParticleAt(x - 12, y, 4);
        my.vfx.moveTrail.emitParticleAt(x + 12, y, 4);
    }

    emitDoubleJumpParticles(x, y) {
        my.vfx.jumpBurst.emitParticleAt(x, y, 14);
        for (let i = 0; i < 3; i++) {
            this.time.delayedCall(i * 40, () => {
                my.vfx.jumpBurst.emitParticleAt(
                    x + Phaser.Math.Between(-20, 20),
                    y + Phaser.Math.Between(-10, 10),
                    4
                );
            });
        }
    }

    // Collectible callbacks
    collectCoin(player, coin) {
        coin.destroy();
        this.score += 100;
        this.sound.play("collect");
        my.vfx.collectBurst.emitParticleAt(coin.x, coin.y, 10);

        if (!this.firstCoinCollected) {
            this.firstCoinCollected = true;
            this.chasers.getChildren().forEach(c => {
                c.setVisible(true);
                c.body.enable = true;
                c.anims.play("chaser-walk");
            });
        }
    }

    collectKey(player, key) {
        key.destroy();
        this.hasKey = true;
        this.sound.play("openDoor");
        my.vfx.collectBurst.emitParticleAt(key.x, key.y, 10);
        this.keyText.setText("Key: ✓").setColor("#ffbb00");

        if (this.doorCollider) this.doorCollider.destroy();
    }

    // Level progression
    completeLevel() {
        this.levelComplete = true;
        this.sound.play("openDoor");
        this.score += 500;

        if (this.doorSprite) this.doorSprite.setAlpha(0.4);

        const player = my.sprite.player;

        // Find the bottom-most ladder tile closest to the player by X, so the
        // player walks to the base of the nearest ladder and climbs out.
        const laddersByX = {};
        my.sprite.ladders.getChildren().forEach(ladder => {
            const key = Math.round(ladder.x / 10) * 10;
            if (!laddersByX[key]) laddersByX[key] = [];
            laddersByX[key].push(ladder);
        });

        let targetLadder = null;
        let closestDist  = Infinity;
        Object.values(laddersByX).forEach(group => {
            const dist = Math.abs(group[0].x - player.x);
            if (dist < closestDist) {
                closestDist  = dist;
                targetLadder = group.reduce((a, b) => a.y > b.y ? a : b);
            }
        });

        const cam = this.cameras.main;
        this.tweens.add({
            targets:  cam,
            zoom:     3,
            duration: 600,
            ease:     "Sine.easeInOut"
        });

        this.time.delayedCall(1000, () => {
            cam.fadeOut(1000, 0, 0, 0);
        });

        this.exitWalkEvent = this.time.addEvent({
            delay: 16,
            repeat: Math.round(2000 / 16),
            callback: () => {
                if (!player.active) return;

                const onLadder = this.physics.overlap(player, my.sprite.ladders);

                if (onLadder) {
                    player.body.setAllowGravity(false);
                    player.body.setVelocityX(0);
                    player.body.setVelocityY(-150);
                    player.anims.play("player-walk", true);
                } else if (targetLadder) {
                    const dir = targetLadder.x > player.x ? 1 : -1;
                    player.body.setAllowGravity(true);
                    player.body.setVelocityX(MOVE_SPEED * dir);
                    player.setFlipX(dir < 0);
                    player.anims.play("player-walk", true);
                }
            }
        });

        this.time.delayedCall(2000, () => {
            if (player.active) {
                player.body.setVelocityX(0);
                player.body.setVelocityY(0);
                player.body.setAllowGravity(true);
            }
            cam.setZoom(1);
            cam.resetFX();
            this.showLevelComplete();
        });
    }

    showLevelComplete() {
        if (this.currentLevel >= 4) {
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once("camerafadeoutcomplete", () => {
                this.scene.start("Platformer", {
                    level: "win", lives: this.lives,
                    score: this.score, abilities: this.abilities
                });
            });
            return;
        }

        this.add.rectangle(
            this.scale.width / 2, this.scale.height / 2,
            this.scale.width, this.scale.height, 0x000000, 1
        ).setScrollFactor(0).setDepth(500);

        this.add.text(this.scale.width / 2, this.scale.height / 2 - 60,
            "LEVEL COMPLETE!",
            { fontFamily: "monospace", fontSize: "48px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(501);

        this.add.text(this.scale.width / 2, this.scale.height / 2,
            `Score: ${this.score}`,
            { fontFamily: "monospace", fontSize: "28px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(501);

        const button = this.add.text(
            this.scale.width / 2, this.scale.height / 2 + 60,
            "[ NEXT LEVEL ]",
            { fontFamily: "monospace", fontSize: "32px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(501).setInteractive();

        button.on("pointerover", () => button.setColor("#ffffff"));
        button.on("pointerout",  () => button.setColor("#62dd99"));
        button.on("pointerdown", () => {
            const nextLevel = this.currentLevel + 1;
            const abilities = { ...this.abilities };
            if (nextLevel >= 2) abilities.wallJump   = true;
            if (nextLevel >= 3) abilities.doubleJump = true;

            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once("camerafadeoutcomplete", () => {
                this.scene.start("Platformer", {
                    level: nextLevel, lives: this.lives,
                    score: this.score, abilities
                });
            });
        });
    }

    showEndScreen() {
        const W = this.scale.width;
        const H = this.scale.height;
        const depth = 500;

        // Full black backdrop
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000)
            .setScrollFactor(0).setDepth(depth);

        const mono = (size, color = "#ffffff") =>
            ({ fontFamily: "monospace", fontSize: `${size}px`, color });

        // Static header
        this.add.text(W / 2, 60, "✦  YOU WIN  ✦", mono(48, "#f1c40f"))
            .setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1);

        this.add.text(W / 2, 118, `Final Score: ${this.score}`, mono(22, "#ffffff"))
            .setOrigin(0.5).setScrollFactor(0).setDepth(depth + 1);

        // Scrolling credits container
        const lines = [
            { text: "",                            size: 14, color: "#ffffff" },
            { text: "─────────────────────",       size: 14, color: "#555555" },
            { text: "CREDITS",                     size: 28, color: "#f1c40f" },
            { text: "─────────────────────",       size: 14, color: "#555555" },
            { text: "",                            size: 14 },
            { text: "DESIGN & PROGRAMMING",        size: 16, color: "#aaaaaa" },
            { text: "Devin Conley & Kenneth Tran", size: 22, color: "#ffffff" },
            { text: "",                            size: 14 },
            { text: "ART & TILES",                 size: 16, color: "#aaaaaa" },
            { text: "Kenney Assets",               size: 22, color: "#ffffff" },
            { text: "",                            size: 14 },
            { text: "─────────────────────",       size: 14, color: "#555555" },
            { text: "",                            size: 14 },
            { text: "Thanks for playing!",         size: 20, color: "#62dd99" },
            { text: "",                            size: 28 },
        ];

        const container = this.add.container(0, 0).setDepth(depth + 1).setScrollFactor(0);
        let yOffset = H + 20; // start just below screen

        lines.forEach(line => {
            const t = this.add.text(
                W / 2, yOffset,
                line.text || "",
                mono(line.size || 18, line.color || "#ffffff")
            ).setOrigin(0.5, 0).setScrollFactor(0);
            container.add(t);
            yOffset += (line.size || 18) + 10;
        });

        const totalHeight = yOffset;
        const scrollDuration = Math.max(8000, totalHeight * 18);

        this.tweens.add({
            targets:  container,
            y:        -(totalHeight + 20),
            duration: scrollDuration,
            ease:     "Linear",
        });

        // Play Again button (always visible at bottom)
        const btnBg = this.add.rectangle(W / 2, H - 36, 220, 44, 0x222222)
            .setScrollFactor(0).setDepth(depth + 2).setStrokeStyle(2, 0xf1c40f);

        const button = this.add.text(W / 2, H - 36, "[ PLAY AGAIN ]", mono(22, "#f1c40f"))
            .setOrigin(0.5).setScrollFactor(0).setDepth(depth + 3).setInteractive();

        button.on("pointerover", () => { button.setColor("#ffffff"); btnBg.setFillStyle(0x444444); });
        button.on("pointerout",  () => { button.setColor("#f1c40f"); btnBg.setFillStyle(0x222222); });
        button.on("pointerdown", () => {
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once("camerafadeoutcomplete", () => {
                this.scene.start("Platformer", {
                    level: 1, lives: 3, score: 0,
                    abilities: { doubleJump: false, wallJump: false }
                });
            });
        });

        this.cameras.main.fadeIn(800, 0, 0, 0);
    }

    // Player death
    playerDie() {
        if (this.isDying) return;
        this.isDying = true;
        this.sound.play("death");
        this.score = 0;
        this.lives--;

        if (my.sprite.player) {
            my.vfx.jumpBurst.emitParticleAt(my.sprite.player.x, my.sprite.player.y, 20);
        }

        this.time.delayedCall(700, () => {
            if (this.lives <= 0) {
                this.cameras.main.fadeOut(400, 0, 0, 0);
                this.cameras.main.once("camerafadeoutcomplete", () => {
                    if (this.currentLevel === 4) {
                        // Checkpoint: restart the boss level with fresh lives.
                        this.scene.start("Platformer", {
                            level: 4, lives: 3, score: this.score,
                            abilities: this.abilities
                        });
                    } else {
                        this.scene.start("Platformer", {
                            level: 1, lives: 3, score: 0,
                            abilities: { doubleJump: false, wallJump: false }
                        });
                    }
                });
            } else {
                this.scene.restart({
                    level:     this.currentLevel,
                    lives:     this.lives,
                    score:     this.score,
                    abilities: this.abilities,
                    skipPan:   true,
                    deathCamX: this.cameras.main.scrollX,
                    deathCamY: this.cameras.main.scrollY,
                    bossHp:    this.bossManager.boss ? this.bossManager.boss.hp : null
                });
            }
        });
    }
}
