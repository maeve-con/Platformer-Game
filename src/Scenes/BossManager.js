// ============================================================
//  BossManager.js
//  Controls the level-3 boss: a flying enemy with two phases.
//
//  Phase 1 — slow sine-wave flight, fires one aimed projectile
//             every 2.2 seconds.
//
//  Phase 2 — triggered at 50% HP. Faster movement, wider sine
//             amplitude, and a 3-shot spread every 1.2 seconds.
//             HP bar turns orange and the camera shakes.
//
//  The player stomps the boss to deal damage (6 hits total).
//  On death the boss explosion opens the exit door so no key
//  is required on the boss level.
// ============================================================

class BossManager {
    // scene — the Platformer scene
    constructor(scene) {
        this.scene = scene;
        this.boss  = null;

        // HP bar UI references (built in buildHPBar)
        this.hpFill = null;
        this.barW   = 260;
    }

    // ── Spawn ─────────────────────────────────────────────────────────────

    // Creates the boss sprite at (cx, cy) using the flying-body setup.
    // Called from LevelSetup when a "boss" Tiled object is found.
    spawnBoss(cx, cy) {
        const scene = this.scene;

        this.boss = scene.physics.add.sprite(cx, cy, "boss")
           

        const boss = this.boss;
        boss.body.allowGravity = false;
        boss.body.setSize(51, 73);  // raw tile size before scale is applied
        boss.hp        = BOSS_MAX_HP;
        boss.phase     = 1;
        boss.dir       = 1;
        boss.fireTimer = 0;
        boss.isAlive   = true;
        boss.originX   = cx;
        boss.originY   = cy;

        return boss;
    }

    // ── HP bar ────────────────────────────────────────────────────────────

    // Builds the HP bar UI at the bottom of the screen.
    // Call this after spawnBoss() in LevelSetup.
    buildHPBar() {
        const scene = this.scene;
        const bw = this.barW;
        const bh = 18;
        const bx = scene.scale.width / 2 - bw / 2;
        const by = scene.scale.height - 36;

        // Black outline
        scene.add.rectangle(bx + bw / 2, by, bw + 4, bh + 4, 0x000000)
            .setScrollFactor(0).setDepth(99).setOrigin(0.5, 0.5);

        // Dark-red background bar
        scene.add.rectangle(bx + bw / 2, by, bw, bh, 0x440000)
            .setScrollFactor(0).setDepth(99).setOrigin(0.5, 0.5);

        // Coloured fill bar (width updated every frame)
        this.hpFill = scene.add.rectangle(bx, by, bw, bh, 0xff2222)
            .setScrollFactor(0).setDepth(100).setOrigin(0, 0.5);

        // Label above the bar
        scene.add.text(scene.scale.width / 2, by - 16, "BOSS", {
            fontFamily: "monospace", fontSize: "14px", color: "#ff4444"
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
    }

    refreshHPBar() {
        if (!this.hpFill) return;
        const pct = Math.max(0, this.boss.hp / BOSS_MAX_HP);
        this.hpFill.setDisplaySize(this.barW * pct, 18);
        // Colour shifts to orange in phase 2 to signal danger
        this.hpFill.setFillStyle(this.boss.phase === 2 ? 0xff8800 : 0xff2222);
    }

    // ── Update ────────────────────────────────────────────────────────────

    // Called every frame from Platformer.update() while the boss is alive.
    update(delta) {
        const boss = this.boss;
        if (!boss || !boss.body || !boss.isAlive) return;

        this.checkPhaseTransition();
        this.moveBoss();
        this.handleFiring(delta);
        this.refreshHPBar();
    }

    checkPhaseTransition() {
        const boss  = this.boss;
        const scene = this.scene;

        if (boss.hp <= BOSS_MAX_HP / 2 && boss.phase === 1) {
            boss.phase = 2;
            this.emitPhaseChangeBurst(boss.x, boss.y);
            scene.cameras.main.shake(400, 0.012);
        }
    }

    moveBoss() {
        const boss  = this.boss;
        const scene = this.scene;

        // Phase 2 is faster and swoops more dramatically
        const speed     = boss.phase === 2 ? 90  : 55;
        const amplitude = boss.phase === 2 ? 70  : 45;
        const freq      = boss.phase === 2 ? 0.0025 : 0.0015;
        const t         = scene.time.now;

        // Horizontal velocity (physics)
        boss.body.setVelocityX(speed * boss.dir);

        // Vertical sine wave (position override — gravity is off)
        boss.y = boss.originY + Math.sin(t * freq * Math.PI * 2) * amplitude;
        boss.body.setVelocityY(0);
        boss.body.reset(boss.x, boss.y); // keep physics body synced with sine Y

        // Reverse at world edges
        const worldW = scene.physics.world.bounds.width;
        if (boss.x < 40 || boss.body.blocked.left)         boss.dir =  1;
        if (boss.x > worldW - 40 || boss.body.blocked.right) boss.dir = -1;

        boss.setFlipX(boss.dir < 0);
    }

    handleFiring(delta) {
        const boss   = this.boss;
        const player = my.sprite.player;
        if (!player || !player.body) return;

        const fireRate = boss.phase === 2 ? 1200 : 2200; // ms between shots
        boss.fireTimer -= delta;

        if (boss.fireTimer <= 0) {
            boss.fireTimer = fireRate;
            this.fireProjectile(boss.x, boss.y, player.x, player.y);
        }
    }

    fireProjectile(bx, by, tx, ty) {
        const scene  = this.scene;
        const angle  = Phaser.Math.Angle.Between(bx, by, tx, ty);
        const speed  = this.boss.phase === 2 ? 220 : 160;
        const group  = scene.bossProjectiles;

        const spawnProj = (a) => {
            const proj = group.create(bx, by, "tilemap_packed")
                .setFrame(BOSS_PROJECTILE_FRAME).setScale(SCALE);
            proj.body.allowGravity = false;
            proj.body.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
            // Destroy after 3 s so stray projectiles don't pile up
            scene.time.delayedCall(3000, () => { if (proj.active) proj.destroy(); });
        };

        spawnProj(angle);

        // Phase 2: 3-shot spread
        if (this.boss.phase === 2) {
            spawnProj(angle - 0.25);
            spawnProj(angle + 0.25);
        }
    }

    // ── Combat callbacks ──────────────────────────────────────────────────

    // Called by physics overlap in LevelSetup when player touches the boss.
    handleContact(player, boss) {
        if (!boss.isAlive) return;
        // Accept top-side hits even if the overlap callback happens inside the boss body.
        const bossTop = boss.body.top;
        const bossH   = boss.body.height || 0;
        // Use a generous threshold: either a fixed 80px or ~70% of the boss body height.
        const generousThreshold = Math.max(80, bossH * 0.7);

        const isStomping = player.body.velocity.y > 0 &&
            (player.body.bottom <= bossTop + generousThreshold || player.body.center.y < boss.body.center.y);

        if (isStomping) {
            this.damageBoss();
            // Bounce the player and give a short invulnerability window so the overlap
            // callback doesn't immediately re-trigger damage while inside the boss body.
            player.body.setVelocityY(-ENEMY_STOMP_VY);
            player.invulnerable = true;
            player.invulnTimer  = 350;
        } else {
            if (!player.invulnerable) this.scene.playerDie();
        }
    }

    damageBoss() {
        const boss  = this.boss;
        const scene = this.scene;
        if (!boss.isAlive) return;

        boss.hp--;
        scene.score += 300;
        scene.cameras.main.shake(150, 0.006);
        my.vfx.bossHit.emitParticleAt(boss.x, boss.y, 16);
        scene.sound.play("collect");

        // Brief white flash on hit
        boss.setTint(0xffffff);
        scene.time.delayedCall(120, () => { if (boss.active) boss.clearTint(); });

        this.refreshHPBar();

        if (boss.hp <= 0) this.killBoss();
    }

    killBoss() {
        const boss  = this.boss;
        const scene = this.scene;

        boss.isAlive = false;
        scene.cameras.main.shake(600, 0.02);
        this.emitPhaseChangeBurst(boss.x, boss.y); // big death explosion
        scene.sound.play("death");
        scene.score += 1000;

        scene.tweens.add({
            targets:  boss,
            alpha:    0,
            duration: 600,
            onComplete: () => {
                boss.destroy();
                // Unlock the exit door — no key needed on boss level
                if (scene.doorSprite) {
                    if (scene.doorCollider) scene.doorCollider.destroy();
                    scene.doorSprite.setAlpha(1);
                    scene.hasKey = true;
                    scene.keyText.setText("Boss defeated!").setColor("#ff4444");
                }
            }
        });
    }

    // ── Particle helpers ──────────────────────────────────────────────────

    // Staggered multi-burst used for phase change and death.
    emitPhaseChangeBurst(x, y) {
        for (let i = 0; i < 4; i++) {
            this.scene.time.delayedCall(i * 80, () => {
                my.vfx.bossHit.emitParticleAt(
                    x + Phaser.Math.Between(-30, 30),
                    y + Phaser.Math.Between(-30, 30),
                    20
                );
            });
        }
    }
}
