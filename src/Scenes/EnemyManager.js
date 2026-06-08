// ============================================================
//  EnemyManager.js
//  Owns the two regular enemy types: patrollers and chasers.
//
//  Patroller — walks back and forth on platforms.
//              Reverses direction when hitting a wall.
//
//  Chaser    — idles with slow patrol until the player comes
//              within CHASE_RANGE px, then sprints toward them
//              and attempts to jump up to reach them.
//
//  Both enemies can be stomped from above by the player.
//  Side/bottom contact hurts the player instead.
// ============================================================

class EnemyManager {
    // scene — the Platformer scene
    constructor(scene) {
        this.scene = scene;
    }

    // ── Frame update ──────────────────────────────────────────────────────

    update(delta) {
        this.updatePatrollers();
        this.updateChasers();
    }

    // ── Patrollers ────────────────────────────────────────────────────────

    updatePatrollers() {
        this.scene.patrollers.getChildren().forEach(enemy => {
            if (!enemy.isAlive || !enemy.body) return;

            // Reverse when hitting a wall (physics body reports it)
            if (enemy.body.blocked.left)  enemy.patrolDir =  1;
            if (enemy.body.blocked.right) enemy.patrolDir = -1;

            enemy.body.setVelocityX(PATROL_SPEED * enemy.patrolDir);
            enemy.setFlipX(enemy.patrolDir > 0);
        });
    }

    // ── Chasers ───────────────────────────────────────────────────────────

    updateChasers() {
        const player = my.sprite.player;
        if (!player || !player.body) return;

        const px = player.x;
        const py = player.y;

        this.scene.chasers.getChildren().forEach(enemy => {
            if (!enemy.isAlive || !enemy.body) return;

            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, px, py);

            // Hysteresis: activate chase a bit before deactivating it,
            // so enemies don't flicker between states at the boundary.
            if (dist < CHASE_RANGE)          enemy.chasing = true;
            if (dist > CHASE_RANGE * 1.4)    enemy.chasing = false;

            if (enemy.chasing) {
                const dir = px < enemy.x ? -1 : 1;
                enemy.body.setVelocityX(CHASE_SPEED * dir);
                enemy.setFlipX(dir < 0);

                // Jump when on ground and player is on a higher platform
                if (enemy.body.blocked.down && py < enemy.y - 30) {
                    enemy.body.setVelocityY(-260);
                }
            } else {
                // Slow idle patrol while waiting for the player to come close
                if (enemy.body.blocked.left)  enemy.idleDir = 1;
                if (enemy.body.blocked.right) enemy.idleDir = -1;
                if (!enemy.idleDir) enemy.idleDir = 1;

                enemy.body.setVelocityX(PATROL_SPEED * 0.5 * enemy.idleDir);
                enemy.setFlipX(enemy.idleDir < 0);
            }
        });
    }

    





    // ── Contact callbacks (registered in LevelSetup) ──────────────────────

    // Called by physics overlap when the player touches a patroller or chaser.
    handleContact(player, enemy) {
        if (!enemy.isAlive) return;

        // Stomp: player is moving downward AND their feet are above enemy center
        const isStomping = player.body.velocity.y > 0 && player.y < enemy.y - 4;

        if (isStomping) {
            this.killEnemy(enemy);
            // Bounce the player up so chained stomps feel good
            player.body.setVelocityY(-ENEMY_STOMP_VY);
        } else {
            if (!player.invulnerable) this.scene.playerDie();
        }
    }

    // Kill a single enemy with a puff of smoke and score reward.
    killEnemy(enemy) {
        if (!enemy.isAlive) return;
        enemy.isAlive = false;

        this.scene.score += 200;
        my.vfx.enemyDeath.emitParticleAt(enemy.x, enemy.y, 12);
        this.scene.sound.play("death");

        // Fade and sink the sprite before destroying it
        this.scene.tweens.add({
            targets:  enemy,
            alpha:    0,
            y:        enemy.y + 20,
            duration: 300,
            onComplete: () => enemy.destroy()
        });
    }
}
