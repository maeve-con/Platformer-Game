class EnemyManager {
    constructor(scene) {
        this.scene = scene;
    }

    update(delta) {
        this.updatePatrollers();
        this.updateChasers(delta);
    }

    // Patrollers
    updatePatrollers() {
        const groundLayer = this.scene.levelSetup.groundLayer;

        this.scene.patrollers.getChildren().forEach(enemy => {
            if (!enemy.isAlive || !enemy.body) return;

            if (enemy.pauseTimer > 0) {
                enemy.pauseTimer -= this.scene.game.loop.delta;
                enemy.body.setVelocityX(0);
                return;
            }

            if (enemy.body.blocked.left)  enemy.patrolDir =  1;
            if (enemy.body.blocked.right) enemy.patrolDir = -1;

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

    // True if there is no solid ground tile one step ahead at foot level.
    _edgeAhead(enemy, dir) {
        const groundLayer = this.scene.levelSetup.groundLayer;
        if (!enemy.body.blocked.down || !groundLayer) return false;
        const probeX = enemy.x + dir * (enemy.body.halfWidth + 6);
        const probeY = enemy.body.bottom + 8;
        const tile   = groundLayer.getTileAtWorldXY(probeX, probeY);
        return !tile || !tile.properties || !tile.properties.collides;
    }

    // Chasers
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

            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, px, py);
            if (dist < CHASE_RANGE)       enemy.chasing = true;
            if (dist > CHASE_RANGE * 1.4) enemy.chasing = false;

            if (enemy.wallJumpCooldown > 0) enemy.wallJumpCooldown -= delta;
            if (enemy.jumpCooldown     > 0) enemy.jumpCooldown     -= delta;

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

            // If the chaser hasn't moved much in 900ms, jump to break free.
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
                // Player is on a higher platform — navigate toward their X,
                // refuse edges, and jump when hitting walls or standing below them.
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

                // Wall-jump while airborne to navigate shafts.
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
                // Player is on a lower platform — walk off edges intentionally.
                enemy.body.setVelocityX(CHASE_SPEED * dirToPlayer);

            } else {
                // Same level — direct chase; jump over obstacles.
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

    // Contact callbacks
    handleContact(player, enemy) {
        if (!enemy.isAlive) return;
        if (player.invulnerable) return;

        const isStomping = player.body.velocity.y > 0 &&
            player.body.bottom < enemy.body.top + 8;

        if (isStomping) {
            this.killEnemy(enemy);
            player.body.setVelocityY(-ENEMY_STOMP_VY);
            player.invulnerable = true;
            player.invulnTimer  = 400;
        } else {
            if (!player.invulnerable) this.scene.playerDie();
        }
    }

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
