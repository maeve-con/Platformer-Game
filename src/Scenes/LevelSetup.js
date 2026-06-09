class LevelSetup {
    constructor(scene, enemyManager, bossManager) {
        this.scene        = scene;
        this.enemyManager = enemyManager;
        this.bossManager  = bossManager;

        this.groundLayer = null;
        this.worldW      = 0;
        this.worldH      = 0;
    }

    buildWorld() {
        const scene   = this.scene;
        const map     = scene.make.tilemap({ key: `level-${scene.currentLevel}` });
        const tileset = map.addTilesetImage("tilemap_packed", "tilemap_packed");

        this.worldW = map.widthInPixels;
        this.worldH = map.heightInPixels;

        scene.physics.world.setBounds(0, 0, this.worldW, this.worldH);
        scene.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

        this.groundLayer = map.createLayer("Ground-n-Platforms", tileset, 0, 0);
        this.groundLayer.setCollisionByProperty({ collides: true });

        this.objectLayer = map.getObjectLayer("Objects");
    }

    placeObjects() {
        const scene = this.scene;

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

        if (scene.currentLevel === 4) {
            playerStartX = 250;
            playerStartY = 300;
        }

        if (!this.objectLayer) return { playerStartX, playerStartY };

        this.objectLayer.objects.forEach(obj => {
            const cx = obj.x + obj.width  / 2;
            const cy = obj.y - obj.height / 2;

            switch (obj.name) {
                case "PlayerStart":
                    playerStartX = obj.x;
                    playerStartY = obj.y - 36;
                    this.spawnX  = playerStartX;
                    this.spawnY  = playerStartY;
                    break;

                case "coin": {
                    const coin = my.sprite.coins.create(cx, cy, "tilemap_packed")
                        .setFrame(obj.gid - 1).setScale(SCALE);
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
                    spring.restedFrame   = obj.gid - 1;
                    spring.extendedFrame = obj.gid;
                    break;
                }

                case "Door":
                    scene.doorSprite = scene.physics.add.sprite(cx, cy, "tilemap_packed")
                        .setFrame(obj.gid - 1).setScale(SCALE * 2);
                    scene.doorSprite.body.allowGravity = false;
                    scene.doorSprite.body.moves        = false;
                    scene.doorSprite.body.immovable    = true;
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
                        .setFrame(ENEMY_PATROL_FRAME).setScale(SCALE / 1.5);
                    p.setCollideWorldBounds(true);
                    p.setBounce(0);
                    p.patrolDir  = 1;
                    p.pauseTimer = 0;
                    p.isAlive    = true;
                    break;
                }

                case "chaser": {
                    const c = scene.chasers.create(cx, cy, "chaser")
                        .setFrame(4).setScale(SCALE);
                    c.setCollideWorldBounds(true);
                    c.isAlive          = true;
                    c.chasing          = false;
                    c.wallJumpCooldown = 0;
                    // Hidden and frozen until the player collects the first coin.
                    c.setVisible(false);
                    c.body.enable = false;
                    break;
                }

                case "boss":
                    this.bossManager.spawnBoss(cx, cy);
                    break;
            }
        });

        return { playerStartX, playerStartY };
    }

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
        p.invulnerable    = true;
        p.invulnTimer     = 2000;

        return p;
    }

    addColliders() {
        const scene  = this.scene;
        const player = my.sprite.player;
        const em     = this.enemyManager;
        const bm     = this.bossManager;

        scene.physics.add.collider(player,           this.groundLayer);
        scene.physics.add.collider(scene.patrollers, this.groundLayer);
        scene.physics.add.collider(scene.chasers,    this.groundLayer);

        scene.physics.add.overlap(player, my.sprite.coins,   scene.collectCoin, null, scene);
        scene.physics.add.overlap(player, my.sprite.keys,    scene.collectKey,  null, scene);

        scene.physics.add.overlap(player, my.sprite.springs, (p, spring) => {
            if (p.body.velocity.y > 0) {
                p.body.setVelocityY(-SPRING_VY);
                scene.sound.play("spring");
                scene.emitJumpParticles(p.x, p.y + 10);

                spring.setFrame(spring.extendedFrame);
                scene.time.delayedCall(120, () => {
                    if (spring.active) spring.setFrame(spring.restedFrame);
                });
            }
        });

        scene.physics.add.overlap(player, my.sprite.spikes, () => {
            if (!player.invulnerable) scene.playerDie();
        });

        if (scene.doorSprite) {
            scene.doorCollider = scene.physics.add.collider(player, scene.doorSprite);
            scene.physics.add.overlap(player, scene.doorSprite, () => {
                if (scene.hasKey && !scene.levelComplete) scene.completeLevel();
            });
        }

        scene.physics.add.overlap(
            player, scene.patrollers,
            (p, e) => em.handleContact(p, e), null, em
        );
        scene.physics.add.overlap(
            player, scene.chasers,
            (p, e) => em.handleContact(p, e), null, em
        );

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

    buildParticles() {
        const scene = this.scene;

        my.vfx.moveTrail = scene.add.particles(0, 0, "dirt_01", {
            speed:    { min: 15,  max: 55  },
            angle:    { min: 150, max: 210 },
            scale:    { start: 0.07, end: 0 },
            alpha:    { start: 0.9, end: 0  },
            lifespan: { min: 150, max: 320  },
            frequency: -1,
        });

        my.vfx.jumpBurst = scene.add.particles(0, 0, "star_01", {
            speed:    { min: 80,  max: 200 },
            angle:    { min: 0,   max: 360 },
            scale:    { start: 0.08, end: 0 },
            alpha:    { start: 1,   end: 0  },
            lifespan: { min: 300, max: 600  },
            frequency: -1,
        });

        my.vfx.collectBurst = scene.add.particles(0, 0, "tilemap_packed", {
            frame:    [ENEMY_PATROL_FRAME, ENEMY_CHASE_FRAME, BOSS_PROJECTILE_FRAME],
            speed:    { min: 100, max: 240 },
            angle:    { min: 0,   max: 360 },
            scale:    { start: 0.10, end: 0 },
            alpha:    { start: 1,   end: 0  },
            lifespan: { min: 350, max: 700  },
            frequency: -1,
        });

        my.vfx.enemyDeath = scene.add.particles(0, 0, "dirt_01", {
            speed:    { min: 60, max: 160 },
            angle:    { min: 0,  max: 360 },
            scale:    { start: 0.12, end: 0 },
            alpha:    { start: 1,   end: 0  },
            lifespan: { min: 200, max: 500  },
            frequency: -1,
        });

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

    buildHUD() {
        const scene = this.scene;
        const style = { fontFamily: "monospace", fontSize: "18px", color: "#ffffff" };

        scene.scoreText = scene.add.text(16, 16, `Score: ${scene.score}`, style)
            .setScrollFactor(0).setDepth(99);

        scene.livesText = scene.add.text(16, 40, `Lives: ${scene.lives}`, style)
            .setScrollFactor(0).setDepth(99);

        scene.keyText = scene.add.text(16, 64, "Key: X", style)
            .setScrollFactor(0).setDepth(99);

        scene.add.text(scene.scale.width - 16, 16, `Level: ${scene.currentLevel}`, style)
            .setOrigin(1).setScrollFactor(0).setDepth(99);

        if (this.bossManager.boss) {
            this.bossManager.buildHPBar();
        }
    }

    runCameraPan(player) {
        const scene  = this.scene;
        const cam    = scene.cameras.main;
        const worldW = this.worldW;
        const worldH = this.worldH;

        // On respawn, pan from the death location to the spawn point instead of
        // running the full level-intro cinematic.
        if (scene.skipPan) {
            const spawnScrollX = Phaser.Math.Clamp(player.x - cam.width  / 2, 0, this.worldW - cam.width);
            const spawnScrollY = Phaser.Math.Clamp(player.y - cam.height / 2, 0, this.worldH - cam.height);

            cam.scrollX = scene.deathCamX !== null ? scene.deathCamX : spawnScrollX;
            cam.scrollY = scene.deathCamY !== null ? scene.deathCamY : spawnScrollY;

            scene.time.delayedCall(600, () => {
                scene.tweens.add({
                    targets:  cam,
                    scrollX:  spawnScrollX,
                    scrollY:  spawnScrollY,
                    duration: 700,
                    ease:     "Sine.easeInOut",
                    onComplete: () => {
                        cam.startFollow(player, true, CAM_LERP_X, CAM_LERP_Y);
                        scene.cameraReady = true;
                    }
                });
            });
            return;
        }

        // Start the pan at the exit door so the player can see the goal first.
        const startX = this.doorX !== undefined ? this.doorX : worldW / 2;
        const startY = this.doorY !== undefined ? this.doorY : worldH / 2;
        cam.scrollX  = Phaser.Math.Clamp(startX - cam.width  / 2, 0, worldW - cam.width);
        cam.scrollY  = Phaser.Math.Clamp(startY - cam.height / 2, 0, worldH - cam.height);

        const endScrollX = Phaser.Math.Clamp(
            (this.spawnX !== undefined ? this.spawnX : player.x) - cam.width  / 2,
            0, worldW - cam.width
        );
        const endScrollY = Phaser.Math.Clamp(
            (this.spawnY !== undefined ? this.spawnY : player.y) - cam.height / 2,
            0, worldH - cam.height
        );

        const barH   = 60;
        const topBar = scene.add.rectangle(
            scene.scale.width / 2, barH / 2,
            scene.scale.width, barH, 0x000000
        ).setScrollFactor(0).setDepth(200);

        const botBar = scene.add.rectangle(
            scene.scale.width / 2, scene.scale.height - barH / 2,
            scene.scale.width, barH, 0x000000
        ).setScrollFactor(0).setDepth(200);

        const titleText = scene.add.text(
            scene.scale.width / 2, scene.scale.height / 2,
            `LEVEL ${scene.currentLevel}`,
            { fontFamily: "monospace", fontSize: "36px", color: "#f1c40f",
              stroke: "#000000", strokeThickness: 5 }
        ).setOrigin(0.5).setScrollFactor(0).setDepth(201).setAlpha(0);

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

        scene.tweens.add({
            targets: [titleText, subText], alpha: 1,
            duration: 400, delay: 200
        });

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
                    scene.cameraReady = true;
                }
            });
        };

        // Linger on the door for 1.2s, then sweep to the spawn point.
        scene.tweens.add({
            targets:  cam,
            scrollX:  endScrollX,
            scrollY:  endScrollY,
            delay:    1200,
            duration: 2500,
            ease:     "Sine.easeInOut",
            onComplete: () => {
                const boss = this.bossManager.boss;
                if (boss) {
                    scene.tweens.add({ targets: [titleText, subText], alpha: 0, duration: 300 });

                    const warnText = scene.add.text(
                        scene.scale.width / 2, scene.scale.height / 2,
                        "⚠  BOSS APPROACHING  ⚠",
                        { fontFamily: "monospace", fontSize: "28px", color: "#ff4444",
                          stroke: "#000000", strokeThickness: 4 }
                    ).setOrigin(0.5).setScrollFactor(0).setDepth(201).setAlpha(0);

                    scene.tweens.add({
                        targets:  cam,
                        scrollX:  Phaser.Math.Clamp(boss.x - cam.width  / 2, 0, worldW - cam.width),
                        scrollY:  Phaser.Math.Clamp(boss.y - cam.height / 2, 0, worldH - cam.height),
                        duration: 1000,
                        ease:     "Sine.easeInOut",
                        onComplete: () => {
                            scene.tweens.add({
                                targets:   warnText,
                                alpha:     1,
                                duration:  200,
                                yoyo:      true,
                                repeat:    3,
                                onComplete: () => {
                                    warnText.destroy();
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
                    handOffToPlayer();
                }
            }
        });
    }
}
