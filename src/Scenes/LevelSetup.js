// ============================================================
//  LevelSetup.js
//  Handles everything that needs to be built at the start of
//  each level inside Platformer.create():
//
//    buildWorld()   — tilemap, world/camera bounds, tile layer
//    placeObjects() — reads the Tiled Objects layer and spawns
//                     coins, keys, springs, door, spikes,
//                     ladders, and enemies
//    spawnPlayer()  — creates the player sprite and sets flags
//    addColliders() — wires up all physics colliders/overlaps
//    buildParticles() — creates every particle emitter
//    buildHUD()     — score/lives/key/level text
//    runCameraPan() — cinematic intro pan + title card
// ============================================================

class LevelSetup {
    // scene         — Platformer scene
    // enemyManager  — EnemyManager instance
    // bossManager   — BossManager instance
    constructor(scene, enemyManager, bossManager) {
        this.scene        = scene;
        this.enemyManager = enemyManager;
        this.bossManager  = bossManager;

        // Expose these so Platformer can reference them
        this.groundLayer = null;
        this.worldW      = 0;
        this.worldH      = 0;
    }

    // ── Step 1: Tilemap + world bounds ────────────────────────────────────

    buildWorld() {
        const scene  = this.scene;
        const mapKey = `level-${scene.currentLevel}`;
        const map    = scene.make.tilemap({ key: mapKey });
        const tileset = map.addTilesetImage("tilemap_packed", "tilemap_packed");

        this.worldW = map.widthInPixels;
        this.worldH = map.heightInPixels;

        scene.physics.world.setBounds(0, 0, this.worldW, this.worldH);
        scene.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

        this.groundLayer = map.createLayer("Ground-n-Platforms", tileset, 0, 0);
        this.groundLayer.setCollisionByProperty({ collides: true });

        // Store the object layer reference so placeObjects() can read it
        this.objectLayer = map.getObjectLayer("Objects");
    }

    // ── Step 2: Spawn everything from the Tiled object layer ──────────────

    // Returns { playerStartX, playerStartY } for Platformer to pass to spawnPlayer().
    placeObjects() {
        const scene = this.scene;

        // Create all physics groups (enemies need groups before objects are read)
        my.sprite.spikes  = scene.physics.add.staticGroup();
        my.sprite.ladders = scene.physics.add.staticGroup();
        my.sprite.coins   = scene.physics.add.staticGroup();
        my.sprite.keys    = scene.physics.add.staticGroup();
        my.sprite.springs = scene.physics.add.staticGroup();
        scene.doorSprite  = null;

        scene.patrollers      = scene.physics.add.group();
        scene.chasers         = scene.physics.add.group();
        scene.bossProjectiles = scene.physics.add.group();

        let playerStartX = 100;
        let playerStartY = this.worldH - 100;

        if (!this.objectLayer) return { playerStartX, playerStartY };

        this.objectLayer.objects.forEach(obj => {
            // Tiled gives top-left x and bottom-left y for objects
            const cx = obj.x + obj.width  / 2;
            const cy = obj.y - obj.height / 2;

            switch (obj.name) {
                case "PlayerStart":
                    playerStartX = obj.x;
                    playerStartY = obj.y - 36;
                    // Store for runCameraPan() so it knows where to end the pan
                    this.spawnX = playerStartX;
                    this.spawnY = playerStartY;
                    break;

                case "coin": {
                    const coin = my.sprite.coins.create(cx, cy, "tilemap_packed")
                        .setFrame(obj.gid - 1).setScale(SCALE);
                    // Bob up and down
                    scene.tweens.add({
                        targets: coin, y: cy - 4,
                        duration: 700 + Math.random() * 200,
                        yoyo: true, repeat: -1, ease: "Sine.easeInOut"
                    });
                    break;
                }

                case "key": {
                    const key = my.sprite.keys.create(cx, cy, "tilemap_packed")
                        .setFrame(obj.gid - 1).setScale(SCALE);
                    scene.tweens.add({
                        targets: key, y: cy - 5,
                        duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut"
                    });
                    break;
                }

                case "spring": {
                    const spring = my.sprite.springs.create(cx, cy, "tilemap_packed")
                        .setFrame(obj.gid - 1).setScale(SCALE);
                    spring.setImmovable(true);
                    spring.refreshBody();
                    spring.restedFrame   = obj.gid - 1; // frame in rested state
                    spring.extendedFrame = obj.gid;     // frame in extended state (gid + 1)
                    break;
                }

                case "Door":
                    scene.doorSprite = scene.physics.add.sprite(cx, cy, "tilemap_packed")
                        .setFrame(obj.gid - 1).setScale(SCALE * 2);
                    scene.doorSprite.body.allowGravity = false;
                    scene.doorSprite.body.moves        = false;
                    scene.doorSprite.body.immovable    = true;
                    // door stays at full alpha — no visual change until player walks through
                    // Store door position so runCameraPan() can start there
                    this.doorX = cx;
                    this.doorY = cy;
                    break;

                case "spike": {
                    const spike = my.sprite.spikes.create(cx, cy, "tilemap_packed")
                        .setFrame(obj.gid - 1).setScale(SCALE);
                    spike.setImmovable(true);
                    spike.refreshBody();
                    break;
                }

                case "ladder": {
                    const ladder = my.sprite.ladders.create(cx, cy, "tilemap_packed")
                        .setFrame(obj.gid - 1).setScale(SCALE);
                    ladder.setImmovable(true);
                    ladder.refreshBody();
                    break;
                }

                case "patroller": {
                    const p = scene.patrollers.create(cx, cy, "patroller")
                        .setFrame(ENEMY_PATROL_FRAME).setScale(SCALE);
                    p.setCollideWorldBounds(true);
                    p.setBounce(0);
                    p.patrolDir = 1;
                    p.isAlive   = true;
                    break;
                }


                    



                case "chaser": {
                    const c = scene.chasers.create(cx, cy, "tilemap_packed")
                        .setFrame(ENEMY_CHASE_FRAME).setScale(SCALE);
                    c.setCollideWorldBounds(true);
                    c.isAlive   = true;
                    c.chasing   = false;
                    break;
                }

                case "boss":
                    this.bossManager.spawnBoss(cx, cy);
                    break;
            }
        });

        return { playerStartX, playerStartY };
    }

    // ── Step 3: Player sprite ─────────────────────────────────────────────

    spawnPlayer(x, y) {
        const scene = this.scene;

        my.sprite.player = scene.physics.add.sprite(x, y, "char-idle")
            .setScale(1.5).setCollideWorldBounds(false).setDepth(10);

        const p = my.sprite.player;
        p.canDoubleJump   = scene.abilities.doubleJump;
        p.canWallJump     = scene.abilities.wallJump;
        p.hasDoubleJumped = false;
        p.wallJumped      = false;
        p.isOnLadder      = false;
        p.wasOnGround     = false;
        p.coyoteTimer     = 0;
        p.jumpBuffer      = 0;
        p.invulnerable    = true;  // brief grace period on spawn
        p.invulnTimer     = 2000;

        return p;
    }

    // ── Step 4: Physics colliders and overlaps ────────────────────────────

    addColliders() {
        const scene  = this.scene;
        const player = my.sprite.player;
        const em     = this.enemyManager;
        const bm     = this.bossManager;

        // Tile collisions
        scene.physics.add.collider(player,           this.groundLayer);
        scene.physics.add.collider(scene.patrollers, this.groundLayer);
        scene.physics.add.collider(scene.chasers,    this.groundLayer);

        // Collectibles
        scene.physics.add.overlap(player, my.sprite.coins,   scene.collectCoin, null, scene);
        scene.physics.add.overlap(player, my.sprite.keys,    scene.collectKey,  null, scene);

        // Springs
        scene.physics.add.overlap(player, my.sprite.springs, (p, spring) => {
            if (p.body.velocity.y > 0) {
                p.body.setVelocityY(-SPRING_VY);
                scene.sound.play("spring");
                scene.emitJumpParticles(p.x, p.y + 10);

                // Briefly show the extended frame, then revert to rested
                spring.setFrame(spring.extendedFrame);
                scene.time.delayedCall(120, () => {
                    if (spring.active) spring.setFrame(spring.restedFrame);
                });
            }
        });

        // Spikes
        scene.physics.add.overlap(player, my.sprite.spikes, () => {
            if (!player.invulnerable) scene.playerDie();
        });

        // Door (blocked until key is collected)
        if (scene.doorSprite) {
            scene.doorCollider = scene.physics.add.collider(player, scene.doorSprite);
            scene.physics.add.overlap(player, scene.doorSprite, () => {
                if (scene.hasKey && !scene.levelComplete) scene.completeLevel();
            });
        }

        // Regular enemies
        scene.physics.add.overlap(
            player, scene.patrollers,
            (p, e) => em.handleContact(p, e), null, em
        );
        scene.physics.add.overlap(
            player, scene.chasers,
            (p, e) => em.handleContact(p, e), null, em
        );

        // Boss and its projectiles
        if (bm.boss) {
            scene.physics.add.overlap(player, scene.bossProjectiles, (p, proj) => {
                proj.destroy();
                if (!player.invulnerable) scene.playerDie();
            });
            scene.physics.add.overlap(
                player, bm.boss,
                (p, b) => bm.handleContact(p, b), null, bm
            );
        }
    }

    // ── Step 5: Particle emitters ─────────────────────────────────────────

    buildParticles() {
        const scene = this.scene;

        // Running dust — emitted while moving on the ground
        my.vfx.moveTrail = scene.add.particles(0, 0, "dirt_01", {
            speed:    { min: 15,  max: 55  },
            angle:    { min: 150, max: 210 },
            scale:    { start: 0.07, end: 0 },
            alpha:    { start: 0.9, end: 0  },
            lifespan: { min: 150, max: 320  },
            frequency: -1,
        });

        // Jump and land burst
        my.vfx.jumpBurst = scene.add.particles(0, 0, "star_01", {
            speed:    { min: 80,  max: 200 },
            angle:    { min: 0,   max: 360 },
            scale:    { start: 0.08, end: 0 },
            alpha:    { start: 1,   end: 0  },
            lifespan: { min: 300, max: 600  },
            frequency: -1,
        });

        // Coin / key collect burst — cycles through multiple tilemap frames for variety
        my.vfx.collectBurst = scene.add.particles(0, 0, "tilemap_packed", {
            frame:    [ENEMY_PATROL_FRAME, ENEMY_CHASE_FRAME, BOSS_PROJECTILE_FRAME],
            speed:    { min: 100, max: 240 },
            angle:    { min: 0,   max: 360 },
            scale:    { start: 0.10, end: 0 },
            alpha:    { start: 1,   end: 0  },
            lifespan: { min: 350, max: 700  },
            frequency: -1,
        });

        // Enemy death — smoke puff
        my.vfx.enemyDeath = scene.add.particles(0, 0, "dirt_01", {
            speed:    { min: 60, max: 160 },
            angle:    { min: 0,  max: 360 },
            scale:    { start: 0.12, end: 0 },
            alpha:    { start: 1,   end: 0  },
            lifespan: { min: 200, max: 500  },
            frequency: -1,
        });

        // Boss hit and phase-change burst — multi-frame for extra visual punch
        my.vfx.bossHit = scene.add.particles(0, 0, "tilemap_packed", {
            frame:    [BOSS_FRAME, ENEMY_PATROL_FRAME, BOSS_PROJECTILE_FRAME],
            speed:    { min: 120, max: 280 },
            angle:    { min: 0,   max: 360 },
            scale:    { start: 0.15, end: 0 },
            alpha:    { start: 1,   end: 0  },
            lifespan: { min: 200, max: 450  },
            frequency: -1,
        });
    }

    // ── Step 6: HUD text ─────────────────────────────────────────────────

    buildHUD() {
        const scene = this.scene;
        const style = { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" };
        const opts  = { scrollFactor: 0, depth: 99 };

        scene.scoreText = scene.add.text(16, 16, `Score: ${scene.score}`, style)
            .setScrollFactor(0).setDepth(99);

        scene.livesText = scene.add.text(16, 40, `Lives: ${scene.lives}`, style)
            .setScrollFactor(0).setDepth(99);

        scene.keyText = scene.add.text(16, 64, "Key: X", style)
            .setScrollFactor(0).setDepth(99);

        scene.add.text(scene.scale.width - 16, 16, `Level: ${scene.currentLevel}`, style)
            .setOrigin(1).setScrollFactor(0).setDepth(99);

        // Boss HP bar is built by BossManager after spawnBoss()
        if (this.bossManager.boss) {
            this.bossManager.buildHPBar();
        }
    }

    // ── Step 7: Cinematic camera pan ──────────────────────────────────────

    // Pans the camera from the exit door to the player spawn point, shows the
    // level title, then hands control to the player (sets scene.cameraReady).
    // On level 3, also swoops to the boss for a dramatic intro before handing off.
    runCameraPan(player) {
        const scene  = this.scene;
        const cam    = scene.cameras.main;
        const worldH = this.worldH;
        const worldW = this.worldW;

        // ── Start at the exit door (fallback: map centre) ─────────────
        const startX = this.doorX !== undefined ? this.doorX : worldW / 2;
        const startY = this.doorY !== undefined ? this.doorY : worldH / 2;
        cam.scrollX  = Phaser.Math.Clamp(startX - cam.width  / 2, 0, worldW - cam.width);
        cam.scrollY  = Phaser.Math.Clamp(startY - cam.height / 2, 0, worldH - cam.height);

        // ── End at the player spawn (fallback: player position) ───────
        const endScrollX = Phaser.Math.Clamp(
            (this.spawnX !== undefined ? this.spawnX : player.x) - cam.width  / 2,
            0, worldW - cam.width
        );
        const endScrollY = Phaser.Math.Clamp(
            (this.spawnY !== undefined ? this.spawnY : player.y) - cam.height / 2,
            0, worldH - cam.height
        );

        // ── Cinematic black bars ──────────────────────────────────────
        const barH   = 60;
        const topBar = scene.add.rectangle(
            scene.scale.width / 2, barH / 2,
            scene.scale.width, barH, 0x000000
        ).setScrollFactor(0).setDepth(200);

        const botBar = scene.add.rectangle(
            scene.scale.width / 2, scene.scale.height - barH / 2,
            scene.scale.width, barH, 0x000000
        ).setScrollFactor(0).setDepth(200);

        // ── Title card ────────────────────────────────────────────────
        const titleText = scene.add.text(
            scene.scale.width / 2, scene.scale.height / 2,
            `LEVEL ${scene.currentLevel}`,
            { fontFamily: "monospace", fontSize: "36px", color: "#f1c40f",
              stroke: "#000000", strokeThickness: 5 }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(201).setAlpha(0);

        // Ability unlock reminder
        let abilityMsg = "";
        if (scene.abilities.doubleJump && scene.abilities.wallJump) abilityMsg = "Double Jump + Wall Jump";
        else if (scene.abilities.doubleJump) abilityMsg = "Double Jump unlocked!";
        else if (scene.abilities.wallJump)   abilityMsg = "Wall Jump unlocked!";

        const subText = scene.add.text(
            scene.scale.width / 2, scene.scale.height / 2 + 44,
            abilityMsg,
            { fontFamily: "monospace", fontSize: "18px", color: "#ffffff",
              stroke: "#000000", strokeThickness: 3 }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(201).setAlpha(0);

        // Fade title in while pan begins
        scene.tweens.add({
            targets: [titleText, subText], alpha: 1,
            duration: 400, delay: 200
        });

        // ── Final hand-off helper ─────────────────────────────────────
        // Fades out all cinematic UI, then starts the camera following the player.
        const handOffToPlayer = () => {
            scene.tweens.add({
                targets:  [topBar, botBar, titleText, subText],
                alpha:    0,
                duration: 400,
                onComplete: () => {
                    topBar.destroy();
                    botBar.destroy();
                    titleText.destroy();
                    subText.destroy();

                    cam.startFollow(player, true, CAM_LERP_X, CAM_LERP_Y);
                    scene.cameraReady = true; // unlock player input
                }
            });
        };

        // ── Pan: door → player spawn ──────────────────────────────────
        // Linger on the door for 1.2 s so the player can see the goal,
        // then sweep across to the spawn point.
        scene.tweens.add({
            targets:  cam,
            scrollX:  endScrollX,
            scrollY:  endScrollY,
            delay:    1200,
            duration: 2500,
            ease:     "Sine.easeInOut",
            onComplete: () => {
                // ── Boss intro pan (level 3 only) ─────────────────────
                const boss = this.bossManager.boss;
                if (boss) {
                    // Fade out the level title while we swoop toward the boss
                    scene.tweens.add({ targets: [titleText, subText], alpha: 0, duration: 300 });

                    // "WARNING" label that flashes during the boss reveal
                    const warnText = scene.add.text(
                        scene.scale.width / 2, scene.scale.height / 2,
                        "⚠  BOSS APPROACHING  ⚠",
                        { fontFamily: "monospace", fontSize: "28px", color: "#ff4444",
                          stroke: "#000000", strokeThickness: 4 }
                    ).setOrigin(0.5).setScrollFactor(0).setDepth(201).setAlpha(0);

                    // Pan the camera to the boss position
                    scene.tweens.add({
                        targets:  cam,
                        scrollX:  Phaser.Math.Clamp(boss.x - cam.width  / 2, 0, worldW - cam.width),
                        scrollY:  Phaser.Math.Clamp(boss.y - cam.height / 2, 0, worldH - cam.height),
                        duration: 1000,
                        ease:     "Sine.easeInOut",
                        onComplete: () => {
                            // Flash the warning text 3 times while held on the boss
                            scene.tweens.add({
                                targets:   warnText,
                                alpha:     1,
                                duration:  200,
                                yoyo:      true,
                                repeat:    3,
                                onComplete: () => {
                                    warnText.destroy();
                                    // Brief pause, then pan back to spawn and hand off
                                    scene.tweens.add({
                                        targets:  cam,
                                        scrollX:  endScrollX,
                                        scrollY:  endScrollY,
                                        duration: 800,
                                        ease:     "Sine.easeInOut",
                                        onComplete: () => {
                                            scene.time.delayedCall(200, handOffToPlayer);
                                        }
                                    });
                                }
                            });
                        }
                    });
                } else {
                    // No boss on this level — hand off directly
                    handOffToPlayer();
                }
            }
        });
    }
}
