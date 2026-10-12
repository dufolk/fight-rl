export const CHARACTERS = {
  kaen: {
    id: 'kaen', name: 'KAEN', cn: '焰', title: '烈焰拳士', element: 'fire',
    walk: 3.3, back: 2.7, run: 7.6, dmg: 1.0,
    superName: '大蛇焚天',
    palettes: [
      { skin: '#f0c19a', hair: '#24161a', hairHi: '#6b2a22', jacket: '#f3efe6', shirt: '#17151d', pants: '#27305a', belt: '#141418', band: '#d4232b', glove: '#c22630', shoe: '#3b2a24', accent: '#ff7a1a', sleeve: 'short' },
      { skin: '#f0c19a', hair: '#2c1b10', hairHi: '#a3611f', jacket: '#24262e', shirt: '#7a1012', pants: '#d8d2c2', belt: '#b18a3c', band: '#f2f2f2', glove: '#2e2e36', shoe: '#1a1a1e', accent: '#ffb020', sleeve: 'short' },
    ],
    hair: [[14, 9], [10, 22], [3, 15], [-6, 28], [-9, 16], [-22, 24], [-16, 8], [-30, 8], [-16, -2], [-24, -10], [-13, -12]],
  },
  raiden: {
    id: 'raiden', name: 'RAIDEN', cn: '雷', title: '紫电狂雷', element: 'thunder',
    walk: 3.7, back: 3.0, run: 8.2, dmg: 0.92,
    superName: '雷霆万钧',
    palettes: [
      { skin: '#e9b993', hair: '#e9edf6', hairHi: '#a9b8ff', jacket: '#2a2142', shirt: '#2a2142', pants: '#e8e4ee', belt: '#7c3cff', band: '#7c3cff', glove: '#2f6cff', shoe: '#1b1b26', accent: '#a07bff', sleeve: 'none' },
      { skin: '#e9b993', hair: '#1d2333', hairHi: '#4fd6ff', jacket: '#e9e4d8', shirt: '#e9e4d8', pants: '#24293a', belt: '#18c6ff', band: '#18c6ff', glove: '#f2f2f2', shoe: '#e0e0e0', accent: '#4fd6ff', sleeve: 'none' },
    ],
    hair: [[14, 8], [8, 20], [0, 16], [-10, 30], [-12, 17], [-30, 24], [-18, 8], [-38, 10], [-18, -2], [-32, -8], [-14, -12]],
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);
