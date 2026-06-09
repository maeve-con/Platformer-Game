// manages all enemy behavior including patrollers and chasers
class EnemyManager {
    constructor(scene) {
        this.scene = scene;
    }

    update(delta) {
        this.updatePatrollers();
        this.updateChasers(delta);
    }

    // move patrollers back and forth, turning at walls and edges
    updatePatrollers() {
        const groundLayer = this.scene.levelSetup.groundLayer;

        this.scene.patrollers.getChildren().forEach(enemy => {
            if (!enemy.isAlive || !enemy.body) return;

            // pause briefly after turning
            if (enemy.pauseTimer > 0) {
                enemy.pauseTimer -= this.scene.game.loop.delta;
                enemy.body.setVelocityX(0);
                return;
            }

            // turn around if blocked by a wall
            if (enemy.body.blocked.left)  enemy.patrolDir =  1;
            if (enemy.body.blocked.right) enemy.patrolDir = -1;

            // turn around if the next step has no ground
            if (enemy.body.blocked.down && groundLayer) {
                const probeX   = enemy.x + enemy.patrolDir * (enemy.body.halfWidth + 6);
                const probeY   = enemy.body.bottom + 8;
                const tile     = groundLayer.getTileAtWorldXY(probeX, probeY);
                const noGround = !tile || !tile.properties || !tile.properties.collides;

                if (noGround) {
                    enemy.patrolDir  = -enemy.patrolDir;
                    enemy.pauseTimer = 350;
                    enemy.body.setVelocityX(0);
                    return;
                }
            }

            enemy.body.setVelocityX(PATROL_SPEED * enemy.patrolDir);
            enemy.setFlipX(enemy.patrolDir > 0);
        });
    }

    // returns true if there is no ground tile one step ahead
    _edgeAhead(enemy, dir) {
        const groundLayer = this.scene.levelSetup.groundLayer;
        if (!enemy.body.blocked.down || !groundLayer) return false;
        const probeX = enemy.x + dir * (enemy.body.halfWidth + 6);
        const probeY = enemy.body.bottom + 8;
        const tile   = groundLayer.getTileAtWorldXY(probeX, probeY);
        return !tile || !tile.properties || !tile.properties.collides;
    }

    // move chasers toward the player when in range, with jumping and wall-jump logic
    updateChasers(delta) {
        const player = my.sprite.player;
        if (!player || !player.body) return;

        const px = player.x;
        const py = player.y;

        this.scene.chasers.getChildren().forEach(enemy => {
            if (!enemy.isAlive || !enemy.body || !enemy.body.enable) return;

            if (enemy.stuckTimer   === undefined) enemy.stuckTimer   = 0;
            if (enemy.lastStuckX   === undefined) enemy.lastStuckX   = enemy.x;
            if (enemy.jumpCooldown === undefined) enemy.jumpCooldown = 0;

            // start chasing when close enough, stop when far enough away
            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, px, py);
            if (dist < CHASE_RANGE)       enemy.chasing = true;
            if (dist > CHASE_RANGE * 1.4) enemy.chasing = false;

            if (enemy.wallJumpCooldown > 0) enemy.wallJumpCooldown -= delta;
            if (enemy.jumpCooldown     > 0) enemy.jumpCooldown     -= delta;

            // idle patrol when not chasing
            if (!enemy.chasing) {
                if (enemy.body.blocked.left)  enemy.idleDir = 1;
                if (enemy.body.blocked.right) enemy.idleDir = -1;
                if (!enemy.idleDir) enemy.idleDir = 1;
                if (this._edgeAhead(enemy, enemy.idleDir)) enemy.idleDir = -enemy.idleDir;

                enemy.body.setVelocityX(PATROL_SPEED * 0.5 * enemy.idleDir);
                enemy.setFlipX(enemy.idleDir > 0);
                return;
            }

            const onGround    = enemy.body.blocked.down;
            const dirToPlayer = px < enemy.x ? -1 : 1;
            const sameXZone   = Math.abs(px - enemy.x) < 12;

            // jump to get unstuck if barely moving for 900ms
            enemy.stuckTimer += delta;
            if (enemy.stuckTimer >= 900) {
                enemy.stuckTimer = 0;
                const movedPx = Math.abs(enemy.x - enemy.lastStuckX);
                enemy.lastStuckX = enemy.x;
                if (movedPx < 8 && onGround && enemy.jumpCooldown <= 0) {
                    enemy.body.setVelocityY(-280);
                    enemy.body.setVelocityX(CHASE_SPEED * dirToPlayer);
                    enemy.jumpCooldown = 600;
                }
            }

            const dyThreshold = 36;
            const playerAbove = py < enemy.y - dyThreshold;
            const playerBelow = py > enemy.y + dyThreshold;

            if (playerAbove) {
                // player is higher up — move toward them and jump at walls or ledges
                const edge = this._edgeAhead(enemy, dirToPlayer);
                enemy.body.setVelocityX(edge ? 0 : CHASE_SPEED * dirToPlayer);

                if (onGround && enemy.jumpCooldown <= 0) {
                    const hitWall = (dirToPlayer === -1 && enemy.body.blocked.left) ||
                                    (dirToPlayer ===  1 && enemy.body.blocked.right);
                    if (hitWall || (sameXZone && !edge)) {
                        enemy.body.setVelocityY(-300);
                        enemy.jumpCooldown = 500;
                    }
                }

                // wall-jump while airborne to get up shafts
                if (!onGround && enemy.wallJumpCooldown <= 0) {
                    if (enemy.body.blocked.left) {
                        enemy.body.setVelocityX( WALL_JUMP_VX * 1.2);
                        enemy.body.setVelocityY(-WALL_JUMP_VY * 0.85);
                        enemy.wallJumpCooldown = 500;
                    } else if (enemy.body.blocked.right) {
                        enemy.body.setVelocityX(-WALL_JUMP_VX * 1.2);
                        enemy.body.setVelocityY(-WALL_JUMP_VY * 0.85);
                        enemy.wallJumpCooldown = 500;
                    }
                }

            } else if (playerBelow) {
                // player is lower — walk off edges on purpose to drop down
                enemy.body.setVelocityX(CHASE_SPEED * dirToPlayer);

            } else {
                // same level — run straight at the player and jump over walls
                const edge = this._edgeAhead(enemy, dirToPlayer);
                enemy.body.setVelocityX((edge && Math.abs(px - enemy.x) > 20) ? 0 : CHASE_SPEED * dirToPlayer);

                if (onGround && enemy.jumpCooldown <= 0) {
                    const hitWall = (dirToPlayer === -1 && enemy.body.blocked.left) ||
                                    (dirToPlayer ===  1 && enemy.body.blocked.right);
                    if (hitWall) {
                        enemy.body.setVelocityY(-260);
                        enemy.jumpCooldown = 500;
                    }
                }
            }

            enemy.setFlipX(dirToPlayer > 0);
        });
    }

    // called when the player touches an enemy
    handleContact(player, enemy) {
        if (!enemy.isAlive) return;
        // ignore contact while the player is invulnerable
        if (player.invulnerable) return;

        // stomp if falling and above the enemy
        const isStomping = player.body.velocity.y > 0 &&
            player.body.bottom < enemy.body.top + 8;

        if (isStomping) {
            this.killEnemy(enemy);
            player.body.setVelocityY(-ENEMY_STOMP_VY);
            // brief invuln so the same stomp can't trigger twice
            player.invulnerable = true;
            player.invulnTimer  = 400;
        } else {
            if (!player.invulnerable) this.scene.playerDie();
        }
    }

    // fade the enemy out and remove it
    killEnemy(enemy) {
        if (!enemy.isAlive) return;
        enemy.isAlive = false;

        this.scene.score += 200;
        my.vfx.enemyDeath.emitParticleAt(enemy.x, enemy.y, 12);
        this.scene.sound.play("death");

        this.scene.tweens.add({
            targets:  enemy,
            alpha:    0,
            y:        enemy.y + 20,
            duration: 300,
            onComplete: () => enemy.destroy()
        });
    }
}
