// handles all boss behavior: movement, firing, phase changes, and death
class BossManager {
    constructor(scene) {
        this.scene = scene;
        this.boss  = null;
        this.hpFill = null;
        this.barW   = 260;
    }

    // create the boss sprite and set its initial state
    spawnBoss(cx, cy) {
        const scene = this.scene;

        this.boss = scene.physics.add.sprite(cx, cy, "boss");

        const boss = this.boss;
        boss.body.allowGravity = false;
        boss.body.setSize(51, 73);
        // restore hp from before the player died, if available
        boss.hp        = (scene.bossHp !== null && scene.bossHp !== undefined) ? scene.bossHp : BOSS_MAX_HP;
        boss.phase     = boss.hp <= BOSS_MAX_HP / 2 ? 2 : 1;
        boss.dir       = 1;
        boss.fireTimer = 0;
        boss.isAlive   = true;
        boss.originX   = cx;
        boss.originY   = cy;

        return boss;
    }

    // draw the hp bar at the bottom of the screen
    buildHPBar() {
        const scene = this.scene;
        const bw = this.barW;
        const bh = 18;
        const bx = scene.scale.width / 2 - bw / 2;
        const by = scene.scale.height - 36;

        scene.add.rectangle(bx + bw / 2, by, bw + 4, bh + 4, 0x000000)
            .setScrollFactor(0).setDepth(99).setOrigin(0.5, 0.5);

        scene.add.rectangle(bx + bw / 2, by, bw, bh, 0x440000)
            .setScrollFactor(0).setDepth(99).setOrigin(0.5, 0.5);

        this.hpFill = scene.add.rectangle(bx, by, bw, bh, 0xff2222)
            .setScrollFactor(0).setDepth(100).setOrigin(0, 0.5);

        scene.add.text(scene.scale.width / 2, by - 16, "BOSS", {
            fontFamily: "monospace", fontSize: "14px", color: "#ff4444"
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
    }

    // resize the hp bar to match current hp, and turn orange in phase 2
    refreshHPBar() {
        if (!this.hpFill) return;
        const pct = Math.max(0, this.boss.hp / BOSS_MAX_HP);
        this.hpFill.setDisplaySize(this.barW * pct, 18);
        this.hpFill.setFillStyle(this.boss.phase === 2 ? 0xff8800 : 0xff2222);
    }

    update(delta) {
        const boss = this.boss;
        if (!boss || !boss.body || !boss.isAlive) return;

        this.checkPhaseTransition(delta);
        this.moveBoss();
        this.handleFiring(delta);
        this.refreshHPBar();
    }

    // switch to phase 2 at half hp, with a random chance to revert each second
    checkPhaseTransition(delta) {
        const boss = this.boss;

        // trigger phase 2 when hp drops to half
        if (boss.hp <= BOSS_MAX_HP / 2 && boss.phase === 1) {
            boss.phase = 2;
            this.emitPhaseChangeBurst(boss.x, boss.y);
            this.scene.cameras.main.shake(400, 0.012);
            return;
        }

        // 10% chance per second to drop back to phase 1 while in phase 2
        if (boss.phase === 2) {
            boss.revertTimer = (boss.revertTimer || 0) + delta;
            if (boss.revertTimer >= 1000) {
                boss.revertTimer = 0;
                if (Math.random() < 0.40) {
                    boss.phase = 1;
                    this.emitPhaseChangeBurst(boss.x, boss.y);
                    this.scene.cameras.main.shake(200, 0.006);
                }
            }
        }
    }

    // move the boss side to side and bob up and down using a sine wave
    moveBoss() {
        const boss  = this.boss;
        const scene = this.scene;

        // phase 2 is faster and bobs more
        const speed     = boss.phase === 2 ? 90    : 55;
        const amplitude = boss.phase === 2 ? 70    : 45;
        const freq      = boss.phase === 2 ? 0.0025 : 0.0015;

        boss.body.setVelocityX(speed * boss.dir);

        // sine wave vertical movement
        boss.y = boss.originY + Math.sin(scene.time.now * freq * Math.PI * 2) * amplitude;
        boss.body.setVelocityY(0);
        boss.body.reset(boss.x, boss.y);

        // bounce off the world edges
        const worldW = scene.physics.world.bounds.width;
        if (boss.x < 40 || boss.body.blocked.left)            boss.dir =  1;
        if (boss.x > worldW - 40 || boss.body.blocked.right)  boss.dir = -1;

        boss.setFlipX(boss.dir < 0);
    }

    // fire projectiles at the player on a timer
    handleFiring(delta) {
        const boss   = this.boss;
        const player = my.sprite.player;
        if (!player || !player.body) return;
        // don't fire during the intro cutscene
        if (this.scene.cutsceneActive) return;

        // phase 2 fires more often
        const fireRate = boss.phase === 2 ? 1200 : 2200;
        boss.fireTimer -= delta;

        if (boss.fireTimer <= 0) {
            boss.fireTimer = fireRate;
            this.fireProjectile(boss.x, boss.y, player.x, player.y);
        }
    }

    // shoot one projectile at the player, or three spread shots in phase 2
    fireProjectile(bx, by, tx, ty) {
        const scene = this.scene;
        const angle = Phaser.Math.Angle.Between(bx, by, tx, ty);
        const speed = this.boss.phase === 2 ? 200 : 160;
        const group = scene.bossProjectiles;

        const spawnProj = (a) => {
            const proj = group.create(bx, by, "tilemap_packed")
                .setFrame(BOSS_PROJECTILE_FRAME).setScale(SCALE);
            proj.body.allowGravity = false;
            proj.body.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
            // destroy projectile after 3 seconds if it hasn't hit anything
            scene.time.delayedCall(3000, () => { if (proj.active) proj.destroy(); });
        };

        spawnProj(angle);
        // phase 2 fires two extra projectiles at slight angles
        if (this.boss.phase === 2) {
            spawnProj(angle - 0.25);
            spawnProj(angle + 0.25);
        }
    }

    // called when the player touches the boss
    handleContact(player, boss) {
        if (!boss.isAlive) return;

        const bossH = boss.body.height || 0;
        const generousThreshold = Math.max(80, bossH * 0.7);

        // count as a stomp if falling and hitting the upper portion of the boss
        const isStomping = player.body.velocity.y > 0 &&
            (player.body.bottom <= boss.body.top + generousThreshold ||
             player.body.center.y < boss.body.center.y);

        if (isStomping) {
            this.damageBoss();
            player.body.setVelocityY(-ENEMY_STOMP_VY);
            // brief invuln so the overlap can't fire twice in one stomp
            player.invulnerable = true;
            player.invulnTimer  = 350;
        } else {
            if (!player.invulnerable) this.scene.playerDie();
        }
    }

    // reduce boss hp and flash it white, then check for death
    damageBoss() {
        const boss  = this.boss;
        const scene = this.scene;
        if (!boss.isAlive) return;

        boss.hp--;
        scene.score += 300;
        scene.cameras.main.shake(150, 0.006);
        my.vfx.bossHit.emitParticleAt(boss.x, boss.y, 16);
        scene.sound.play("collect");

        // flash white to show the hit landed
        boss.setTint(0xffffff);
        scene.time.delayedCall(120, () => { if (boss.active) boss.clearTint(); });

        this.refreshHPBar();
        if (boss.hp <= 0) this.killBoss();
    }

    // play the death sequence: slow motion, vfx bursts, then fade to credits
    killBoss() {
        const boss  = this.boss;
        const scene = this.scene;

        boss.isAlive        = false;
        scene.levelComplete = true; // lock player input and prevent further damage
        scene.score        += 1000;

        // slow down time for dramatic effect
        scene.tweens.add({
            targets:   scene.time,
            timeScale: 0.15,
            duration:  300,
            ease:      "Sine.easeOut"
        });
        scene.physics.world.timeScale = 6; // higher value = slower physics

        // fire vfx bursts across the boss body
        let burstCount = 0;
        const maxBursts = 4;
        const burstEvent = scene.time.addEvent({
            delay:    80,
            repeat:   maxBursts - 1,
            callback: () => {
                if (!boss.active) return;
                const ox = boss.x + Phaser.Math.Between(-40, 40);
                const oy = boss.y + Phaser.Math.Between(-40, 40);
                my.vfx.bossHit.emitParticleAt(ox, oy, 20);
                scene.cameras.main.shake(80, 0.01);
                burstCount++;
            }
        });

        // spin and grow the boss as it fades out
        scene.tweens.add({
            targets:  boss,
            alpha:    0,
            angle:    720,
            scaleX:   3,
            scaleY:   3,
            duration: maxBursts * 80 + 200,
            ease:     "Sine.easeIn",
            onComplete: () => { if (boss.active) boss.destroy(); }
        });

        // after the explosion, restore time and fade to the credits screen
        const totalDuration = maxBursts * 80 + 400;
        scene.time.delayedCall(totalDuration, () => {
            scene.tweens.add({
                targets:   scene.time,
                timeScale: 1,
                duration:  400,
                ease:      "Sine.easeIn"
            });
            scene.physics.world.timeScale = 1;

            scene.cameras.main.shake(500, 0.025);

            scene.time.delayedCall(600, () => {
                scene.cameras.main.fadeOut(1200, 0, 0, 0);
                scene.cameras.main.once("camerafadeoutcomplete", () => {
                    scene.scene.start("Platformer", {
                        level: "win", lives: scene.lives,
                        score: scene.score, abilities: scene.abilities
                    });
                });
            });
        });
    }

    // emit a ring of particles for phase change and death effects
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
