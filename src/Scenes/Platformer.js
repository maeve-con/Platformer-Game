// ============================================================
//  Platformer.js  —  Main scene (scene shell only)
//
//  This file is intentionally thin. All heavy lifting is
//  delegated to dedicated helper classes:
//
//    LevelSetup       — map, objects, colliders, HUD, cam pan
//    PlayerController — input, movement, jumping, ladder
//    EnemyManager     — patroller + chaser AI
//    BossManager      — boss AI, phases, projectiles, HP bar
//
//  Load order in index.html (each as a <script> tag):
//    1. constants.js
//    2. PlayerController.js
//    3. EnemyManager.js
//    4. BossManager.js
//    5. LevelSetup.js
//    6. Platformer.js   <- this file
//    7. Load.js
//    8. main.js
// ============================================================

class Platformer extends Phaser.Scene {
    constructor() {
        super("Platformer");
    }

    // ── Init ──────────────────────────────────────────────────────────────
    // Runs before create(). Resets all per-level state so restarting the
    // scene with new data always starts clean.
    init(data) {
        this.currentLevel       = data.level || 1;
        this.lives              = data.lives !== undefined ? data.lives : 3;
        this.score              = data.score || 0;
        this.hasKey             = false;
        this.levelComplete      = false;
        this.isDying            = false;
        this.walkSoundPlaying   = false;
        this.ladderSoundPlaying = false;
        this.wallCoyoteTimer    = 0;
        this.lastWallDir        = 0;
        this.cameraReady        = false; // unlocked after the intro pan finishes
        this.doorSprite         = null;
        this.doorCollider       = null;

        this.abilities = data.abilities || { doubleJump: false, wallJump: false };
    }

    // ── Create ────────────────────────────────────────────────────────────
    create() {
        // Win screen is handled as a special "level" value
        if (this.currentLevel === "win") {
            this.showEndScreen();
            return;
        }

        // Instantiate all helper systems
        this.enemyManager  = new EnemyManager(this);
        this.bossManager   = new BossManager(this);
        this.levelSetup    = new LevelSetup(this, this.enemyManager, this.bossManager);
        this.playerCtrl    = new PlayerController(this);

        // Build the level in order — each step depends on the previous
        this.levelSetup.buildWorld();
        const { playerStartX, playerStartY } = this.levelSetup.placeObjects();
        const player = this.levelSetup.spawnPlayer(playerStartX, playerStartY);

        this.levelSetup.addColliders();
        this.levelSetup.buildParticles();
        this.levelSetup.buildHUD();

        this.playerCtrl.init();

        this.prevOnGround = true;

        // Kick off the cinematic intro pan (sets cameraReady when done)
        this.levelSetup.runCameraPan(player);
    }

    // ── Update ────────────────────────────────────────────────────────────
    update(time, delta) {
        if (!my.sprite.player || !my.sprite.player.body) return;
        if (this.levelComplete || this.isDying) return;

        // Always tick enemies (they move during the camera pan too)
        this.enemyManager.update(delta);
        if (this.bossManager.boss && this.bossManager.boss.isAlive) {
            this.bossManager.update(delta);
        }

        // Player input is locked until the intro pan completes
        if (!this.cameraReady) return;

        this.playerCtrl.update(delta);
    }

    // ── Particle helpers (called by PlayerController and managers) ─────────

    emitJumpParticles(x, y) {
        my.vfx.jumpBurst.emitParticleAt(x - 8, y, 6);
        my.vfx.jumpBurst.emitParticleAt(x + 8, y, 6);
    }

    emitLandParticles(x, y) {
        // Wider, lower burst to distinguish landing from jumping
        my.vfx.moveTrail.emitParticleAt(x - 12, y, 4);
        my.vfx.moveTrail.emitParticleAt(x + 12, y, 4);
    }

    emitDoubleJumpParticles(x, y) {
        my.vfx.jumpBurst.emitParticleAt(x, y, 14);
        // Staggered ring for extra pop
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

    // ── Collectible callbacks (referenced by LevelSetup.addColliders) ──────

    collectCoin(player, coin) {
        coin.destroy();
        this.score += 100;
        this.sound.play("collect");
        my.vfx.collectBurst.emitParticleAt(coin.x, coin.y, 10);
    }

    collectKey(player, key) {
        key.destroy();
        this.hasKey = true;
        this.sound.play("openDoor");
        my.vfx.collectBurst.emitParticleAt(key.x, key.y, 10);
        this.keyText.setText("Key: ✓").setColor("#ffbb00");

        // Remove the physical door barrier
        if (this.doorCollider) this.doorCollider.destroy();

        // Animate the door bobbing to show it's open
        if (this.doorSprite) {
            this.doorSprite.setAlpha(1);
            this.tweens.add({
                targets:  this.doorSprite,
                y:        this.doorSprite.y - 4,
                duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
            });
        }
    }

    // ── Level progression ─────────────────────────────────────────────────

    completeLevel() {
        this.levelComplete = true;
        this.sound.play("openDoor");
        this.score += 500;

        // Level 3 goes straight to the win screen
        if (this.currentLevel >= 3) {
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once("camerafadeoutcomplete", () => {
                this.scene.start("Platformer", {
                    level: "win", lives: this.lives,
                    score: this.score, abilities: this.abilities
                });
            });
            return;
        }

        // Overlay: dim the screen and show completion UI
        this.add.rectangle(
            this.scale.width / 2, this.scale.height / 2,
            this.scale.width, this.scale.height, 0x000000, 0.65
        ).setScrollFactor(0).setDepth(100);

        this.add.text(this.scale.width / 2, this.scale.height / 2 - 60,
            "LEVEL COMPLETE!",
            { fontFamily: "monospace", fontSize: "48px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        this.add.text(this.scale.width / 2, this.scale.height / 2,
            `Score: ${this.score}`,
            { fontFamily: "monospace", fontSize: "28px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        const button = this.add.text(
            this.scale.width / 2, this.scale.height / 2 + 60,
            "[ NEXT LEVEL ]",
            { fontFamily: "monospace", fontSize: "32px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100).setInteractive();

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
        this.add.rectangle(
            this.scale.width / 2, this.scale.height / 2,
            this.scale.width, this.scale.height, 0x000000, 0.7
        ).setScrollFactor(0).setDepth(100);

        this.add.text(this.scale.width / 2, this.scale.height / 2 - 60,
            "YOU WIN!",
            { fontFamily: "monospace", fontSize: "56px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        this.add.text(this.scale.width / 2, this.scale.height / 2,
            `Final Score: ${this.score}`,
            { fontFamily: "monospace", fontSize: "28px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100);

        const button = this.add.text(
            this.scale.width / 2, this.scale.height / 2 + 60,
            "[ PLAY AGAIN ]",
            { fontFamily: "monospace", fontSize: "32px", color: "#f1c40f" }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(100).setInteractive();

        button.on("pointerover", () => button.setColor("#ffffff"));
        button.on("pointerout",  () => button.setColor("#62dd99"));
        button.on("pointerdown", () => {
            this.cameras.main.fadeOut(500, 0, 0, 0);
            this.cameras.main.once("camerafadeoutcomplete", () => {
                this.scene.start("Platformer", {
                    level: 1, lives: 3, score: 0,
                    abilities: { doubleJump: false, wallJump: false }
                });
            });
        });

        this.cameras.main.fadeIn(500, 0, 0, 0);
    }

    // ── Player death ──────────────────────────────────────────────────────

    playerDie() {
        if (this.isDying) return;
        this.isDying = true;
        this.sound.play("death");
        this.score = 0;
        this.lives--;

        // Death burst before the fade
        if (my.sprite.player) {
            my.vfx.jumpBurst.emitParticleAt(my.sprite.player.x, my.sprite.player.y, 20);
        }

        this.time.delayedCall(700, () => {
            if (this.lives <= 0) {
                // Game over — restart from level 1
                this.cameras.main.fadeOut(400, 0, 0, 0);
                this.cameras.main.once("camerafadeoutcomplete", () => {
                    this.scene.start("Platformer", {
                        level: 1, lives: 3, score: 0,
                        abilities: { doubleJump: false, wallJump: false }
                    });
                });
            } else {
                // Respawn on the same level with remaining lives
                this.cameras.main.fadeOut(300, 0, 0, 0);
                this.cameras.main.once("camerafadeoutcomplete", () => {
                    this.scene.restart({
                        level: this.currentLevel, lives: this.lives,
                        score: this.score, abilities: this.abilities
                    });
                });
            }
        });
    }
}
