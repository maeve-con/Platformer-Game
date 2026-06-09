// ============================================================
//  EnemyManager.js
//  Owns the two regular enemy types: patrollers and chasers.
//
//  Patroller — walks back and forth on platforms.
//              Reverses direction when hitting a wall.
//
//  Chaser    — idles with slow patrol until the player comes
//              within CHASE_RANGE px, then uses platform-aware
//              pathfinding to actually navigate to the player:
//
//    · Detects what Y-level the player is on vs itself.
//    · If the player is ABOVE: walk toward them and jump when
//      hitting a wall or when below a ledge — don't walk off
//      edges unnecessarily.
//    · If the player is BELOW or SAME level: will walk off
//      edges intentionally to drop down to them.
//    · Stuck detection: if the chaser hasn't moved much in
//      ~1 second, it attempts a jump to break itself free.
//
//  Both enemies can be stomped from above by the player.
//  Side/bottom contact hurts the player instead.
// ============================================================

class EnemyManager {
    constructor(scene) {
        this.scene = scene;
    }

    // ── Frame update ──────────────────────────────────────────────────────

    update(delta) {
        this.updatePatrollers();
        this.updateChasers(delta);
    }

    // ── Patrollers ────────────────────────────────────────────────────────

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

    // ── Tilemap helpers ───────────────────────────────────────────────────

    // True if there is no solid ground tile one step ahead at foot level.
    _edgeAhead(enemy, dir) {
        const groundLayer = this.scene.levelSetup.groundLayer;
        if (!enemy.body.blocked.down || !groundLayer) return false;
        const probeX = enemy.x + dir * (enemy.body.halfWidth + 6);
        const probeY = enemy.body.bottom + 8;
        const tile   = groundLayer.getTileAtWorldXY(probeX, probeY);
        return !tile || !tile.properties || !tile.properties.collides;
    }

    // True if there is a solid wall tile directly above the enemy's head
    // in the given horizontal direction (useful to detect low ceilings).
    _wallAbove(enemy, dir) {
        const groundLayer = this.scene.levelSetup.groundLayer;
        if (!groundLayer) return false;
        const probeX = enemy.x + dir * (enemy.body.halfWidth + 4);
        const probeY = enemy.body.top - 4;
        const tile   = groundLayer.getTileAtWorldXY(probeX, probeY);
        return tile && tile.properties && tile.properties.collides;
    }

    // Scan upward from the enemy's position to estimate how high a platform
    // the chaser could reach with a single jump (approx. tile-by-tile).
    // Returns the world-Y of the first solid tile encountered above, or null.
    _solidFloorAbove(enemy) {
        const groundLayer = this.scene.levelSetup.groundLayer;
        if (!groundLayer) return null;
        // Sample every 18px (one tile height) upward from the enemy's head
        // up to ~4 tiles — that's roughly the height of one jump.
        for (let dy = 18; dy <= 18 * 5; dy += 18) {
            const tile = groundLayer.getTileAtWorldXY(enemy.x, enemy.body.top - dy);
            if (tile && tile.properties && tile.properties.collides) {
                return tile.pixelY + tile.height; // world Y of the floor surface
            }
        }
        return null;
    }

    // ── Chasers ───────────────────────────────────────────────────────────

    updateChasers(delta) {
        const player = my.sprite.player;
        if (!player || !player.body) return;

        const px = player.x;
        const py = player.y;

        this.scene.chasers.getChildren().forEach(enemy => {
            if (!enemy.isAlive || !enemy.body || !enemy.body.enable) return;

            // ── Initialise per-enemy tracking state ───────────────────
            if (enemy.stuckTimer    === undefined) enemy.stuckTimer    = 0;
            if (enemy.lastStuckX    === undefined) enemy.lastStuckX    = enemy.x;
            if (enemy.jumpCooldown  === undefined) enemy.jumpCooldown  = 0;

            // ── Chase range hysteresis ────────────────────────────────
            const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, px, py);
            if (dist < CHASE_RANGE)       enemy.chasing = true;
            if (dist > CHASE_RANGE * 1.4) enemy.chasing = false;

            // ── Tick cooldowns ────────────────────────────────────────
            if (enemy.wallJumpCooldown > 0) enemy.wallJumpCooldown -= delta;
            if (enemy.jumpCooldown     > 0) enemy.jumpCooldown     -= delta;

            // ── Idle patrol (out of range) ────────────────────────────
            if (!enemy.chasing) {
                if (enemy.body.blocked.left)  enemy.idleDir = 1;
                if (enemy.body.blocked.right) enemy.idleDir = -1;
                if (!enemy.idleDir) enemy.idleDir = 1;
                if (this._edgeAhead(enemy, enemy.idleDir)) enemy.idleDir = -enemy.idleDir;

                enemy.body.setVelocityX(PATROL_SPEED * 0.5 * enemy.idleDir);
                enemy.setFlipX(enemy.idleDir > 0);
                return;
            }

            // ══════════════════════════════════════════════════════════
            //  PLATFORM-AWARE CHASE LOGIC
            //
            //  Key insight: rather than always heading toward the player's
            //  raw X, we figure out *what situation* we're in and pick
            //  the right move:
            //
            //   SAME_LEVEL  → just run at the player, stop at edges only
            //                 if the player isn't there.
            //   PLAYER_ABOVE → navigate toward the player's X, jump when
            //                  hitting walls or when under a ledge we can
            //                  hop onto. Never walk off edges.
            //   PLAYER_BELOW → walk off the edge in the player's direction
            //                  to drop down to them.
            // ══════════════════════════════════════════════════════════

            const onGround    = enemy.body.blocked.down;
            const dyThreshold = 36; // px — treat as "same level" within this band

            const playerAbove = py < enemy.y - dyThreshold;
            const playerBelow = py > enemy.y + dyThreshold;
            // "same level" is implied when neither flag is set

            const dirToPlayer = px < enemy.x ? -1 : 1;
            const sameXZone   = Math.abs(px - enemy.x) < 12; // directly under/over

            // ── Stuck detection ───────────────────────────────────────
            // If we've barely moved in 900 ms while chasing, try a jump.
            enemy.stuckTimer += delta;
            if (enemy.stuckTimer >= 900) {
                enemy.stuckTimer = 0;
                const movedPx = Math.abs(enemy.x - enemy.lastStuckX);
                enemy.lastStuckX = enemy.x;
                if (movedPx < 8 && onGround && enemy.jumpCooldown <= 0) {
                    // Jump straight up or slightly toward the player
                    enemy.body.setVelocityY(-280);
                    enemy.body.setVelocityX(CHASE_SPEED * dirToPlayer);
                    enemy.jumpCooldown = 600;
                }
            }

            // ── Decide horizontal movement ────────────────────────────

            if (playerAbove) {
                // Player is on a higher platform.
                // Move toward player's X but refuse to walk off ledges —
                // we want to stay on our platform and look for a wall to
                // jump off, or wait until we're under an accessible ledge.
                const edge = this._edgeAhead(enemy, dirToPlayer);

                if (edge) {
                    // Cliff in the direction of the player — stop and wait
                    // for a wall-jump or stuck-jump to save us.
                    enemy.body.setVelocityX(0);
                } else {
                    enemy.body.setVelocityX(CHASE_SPEED * dirToPlayer);
                }

                // Jump when hitting a wall (trying to climb up)
                if (onGround && enemy.body.blocked.down && enemy.jumpCooldown <= 0) {
                    const hitWall = (dirToPlayer === -1 && enemy.body.blocked.left) ||
                                    (dirToPlayer ===  1 && enemy.body.blocked.right);
                    if (hitWall) {
                        enemy.body.setVelocityY(-280);
                        enemy.jumpCooldown = 500;
                    }

                    // Also jump if we're directly below the player (and no edge ahead)
                    if (sameXZone && !edge) {
                        enemy.body.setVelocityY(-300);
                        enemy.jumpCooldown = 500;
                    }
                }

                // Wall-jump while airborne to navigate narrow shafts
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
                // Player is on a lower platform.
                // Walk toward the player's X; willingly step off edges when
                // the gap is in the right direction.
                const edge = this._edgeAhead(enemy, dirToPlayer);

                if (edge) {
                    // Walk off intentionally — the drop heads toward the player
                    enemy.body.setVelocityX(CHASE_SPEED * dirToPlayer);
                } else {
                    enemy.body.setVelocityX(CHASE_SPEED * dirToPlayer);
                }

            } else {
                // Same level — straightforward chase, but still respect edges
                // that would send us the wrong way.
                const edge = this._edgeAhead(enemy, dirToPlayer);

                if (edge && Math.abs(px - enemy.x) > 20) {
                    // Edge ahead but player isn't right there — stop
                    enemy.body.setVelocityX(0);
                } else {
                    enemy.body.setVelocityX(CHASE_SPEED * dirToPlayer);
                }

                // Jump over obstacles on the same level
                if (onGround && enemy.jumpCooldown <= 0) {
                    const hitWall = (dirToPlayer === -1 && enemy.body.blocked.left) ||
                                    (dirToPlayer ===  1 && enemy.body.blocked.right);
                    if (hitWall) {
                        enemy.body.setVelocityY(-260);
                        enemy.jumpCooldown = 500;
                    }
                }
            }

            // ── Facing direction ──────────────────────────────────────
            enemy.setFlipX(dirToPlayer > 0);
        });
    }

    // ── Contact callbacks ─────────────────────────────────────────────────

    handleContact(player, enemy) {
        if (!enemy.isAlive) return;

        const isStomping = player.body.velocity.y > 0 &&
            player.body.bottom < enemy.body.top + 8;

        if (isStomping) {
            this.killEnemy(enemy);
            player.body.setVelocityY(-ENEMY_STOMP_VY);
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
