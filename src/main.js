// debug with extreme prejudice
"use strict"

// game config
let config = {
    parent: 'phaser-game',
    type: Phaser.CANVAS,
    render: {
        pixelArt: true  // prevent pixel art from getting blurred when scaled
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false,
            gravity: {
                x: 0, 
                y: 600
            }
        }
    },
    width: 800,
    height: 600,
    scene: [Load, Platformer]   // scenes go here
}

var cursors;
const SCALE = 1.0;
var my = {sprite: {}, text: {}, vfx: {}};
const DEBUG_LEVEL = 1; 
const game = new Phaser.Game(config);