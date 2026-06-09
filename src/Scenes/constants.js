// ── Player movement ──────────────────────────────────────────
const MOVE_SPEED           = 150;   // px/s horizontal speed
const JUMP_VELOCITY        = 300;   // upward velocity for a normal jump
const DOUBLE_JUMP_VELOCITY = 300;   // upward velocity for double jump
const SPRING_VY            = 550;   // upward velocity from a spring
const WALL_JUMP_VX         = 100;   // horizontal kick from wall jump
const WALL_JUMP_VY         = 250;   // vertical kick from wall jump

// ── Camera ───────────────────────────────────────────────────
const CAM_LERP_X = 0.02;
const CAM_LERP_Y = 0.02;

// ── Enemies ──────────────────────────────────────────────────
const PATROL_SPEED       = 70;    // px/s for patroller movement
const CHASE_SPEED        = 150;   // px/s when chaser is pursuing
const CHASE_RANGE        = 520;   // px — chaser activates within this distance
const ENEMY_STOMP_VY     = 220;   // bounce the player gets after stomping an enemy

// ── Tilemap frame indices ─────────────────────────────────────
const ENEMY_PATROL_FRAME    = 84;  // patroller sprite
const ENEMY_CHASE_FRAME     = 100; // chaser sprite
const BOSS_FRAME            = 112; // boss body sprite
const BOSS_PROJECTILE_FRAME = 67;  // projectile tile

// ── Boss ─────────────────────────────────────────────────────
const BOSS_MAX_HP = 6;   // stomps required to defeat the boss
