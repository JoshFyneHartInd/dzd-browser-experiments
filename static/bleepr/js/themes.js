/* Theme registry. Classic script, loaded in <head> before first paint.
 * Single source of truth for theme colors. Exposes window.BleeprThemes.
 * Each theme: { id, name, group, scheme: 'light'|'dark', vars: { '--bg': ... } }
 * Missing variables fall back to Paper (light) or Midnight (dark).
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'bleepr.theme';
  var SYSTEM = 'system';

  var THEMES = [
    {
      id: 'paper', name: 'Paper', group: 'Standard', scheme: 'light',
      vars: {
        '--bg': '#f6f5f1', '--surface': '#ffffff', '--surface-2': '#ebeae4', '--border': '#d4d2c8',
        '--fg': '#1b1c1f', '--fg-muted': '#62646b', '--accent': '#2f6fed', '--accent-fg': '#ffffff',
        '--note': '#e0702a', '--note-selected': '#b3470a', '--key-white': '#ffffff', '--key-black': '#2a2b2f',
        '--danger': '#c62f3a',
        '--layer-1': '#d4621c', '--layer-2': '#2f6fed', '--layer-3': '#2b8a3e',
        '--layer-4': '#9c36b5', '--layer-5': '#c2255c', '--layer-6': '#0c8599'
      }
    },
    {
      id: 'midnight', name: 'Midnight', group: 'Standard', scheme: 'dark',
      vars: {
        '--bg': '#14161a', '--surface': '#1d2026', '--surface-2': '#272b33', '--border': '#363b45',
        '--fg': '#e8e9ec', '--fg-muted': '#9aa0ab', '--accent': '#6c9bff', '--accent-fg': '#0b1020',
        '--note': '#ffa05c', '--note-selected': '#ffc89a', '--key-white': '#d9dbe0', '--key-black': '#0f1013',
        '--danger': '#ff7a85',
        '--layer-1': '#ffa05c', '--layer-2': '#6c9bff', '--layer-3': '#6fd08a',
        '--layer-4': '#d29bff', '--layer-5': '#ff7aa8', '--layer-6': '#4fd1e0'
      }
    },
    {
      id: 'high-contrast', name: 'High Contrast', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#000000', '--surface': '#000000', '--surface-2': '#000000', '--border': '#ffffff',
        '--fg': '#ffffff', '--fg-muted': '#cccccc', '--accent': '#ffff00', '--accent-fg': '#000000',
        '--note': '#00ff66', '--note-selected': '#80ffb3', '--key-white': '#e0e0e0', '--key-black': '#000000',
        '--danger': '#ff3333', '--layer-1': '#00ff66', '--layer-2': '#ffff00', '--layer-3': '#ff3333',
        '--layer-4': '#00d0ff', '--layer-5': '#2b32ff', '--layer-6': '#bf00ff'
      }
    },
    {
      id: 'matrix', name: 'Matrix', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#020803', '--surface': '#04140a', '--surface-2': '#0a2415', '--border': '#1c4d2e',
        '--fg': '#c9ffd8', '--fg-muted': '#5f9c74', '--accent': '#39ff6a', '--accent-fg': '#03150a',
        '--note': '#e8ff3b', '--note-selected': '#f4ff9d', '--key-white': '#b1e3bf', '--key-black': '#010502',
        '--danger': '#ff3b3b', '--layer-1': '#e8ff3b', '--layer-2': '#39ff6a', '--layer-3': '#ff3b3b',
        '--layer-4': '#3ba3ff', '--layer-5': '#6c3bff', '--layer-6': '#ff3bf8'
      }
    },
    {
      id: 'synthwave', name: 'Synthwave', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#170822', '--surface': '#200f33', '--surface-2': '#2c1447', '--border': '#5a2c82',
        '--fg': '#f5e8ff', '--fg-muted': '#b98fd8', '--accent': '#ff2fd6', '--accent-fg': '#1a0620',
        '--note': '#ffe135', '--note-selected': '#fff09a', '--key-white': '#dbcee7', '--key-black': '#0e0514',
        '--danger': '#ff4d6d', '--layer-1': '#ffe135', '--layer-2': '#ff2fd6', '--layer-3': '#2fe8ff',
        '--layer-4': '#ff4d6d', '--layer-5': '#7fff35', '--layer-6': '#35ff89'
      }
    },
    {
      id: 'terminal', name: 'Terminal', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0a0700', '--surface': '#161000', '--surface-2': '#221800', '--border': '#4d3800',
        '--fg': '#ffce6b', '--fg-muted': '#a67f34', '--accent': '#ffb000', '--accent-fg': '#160f00',
        '--note': '#8bff5a', '--note-selected': '#c5ffad', '--key-white': '#e3b75e', '--key-black': '#060400',
        '--danger': '#ff4d3d', '--layer-1': '#8bff5a', '--layer-2': '#ffb000', '--layer-3': '#ff4d3d',
        '--layer-4': '#5affaa', '--layer-5': '#5ad2ff', '--layer-6': '#635aff'
      }
    },
    {
      id: 'blood', name: 'Blood', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0a0000', '--surface': '#160303', '--surface-2': '#220505', '--border': '#5c0f0f',
        '--fg': '#ffd6d6', '--fg-muted': '#b06666', '--accent': '#ff3355', '--accent-fg': '#160303',
        '--note': '#ffb020', '--note-selected': '#ffd890', '--key-white': '#e3bdbd', '--key-black': '#060000',
        '--danger': '#ff0022', '--layer-1': '#ffb020', '--layer-2': '#ff3355', '--layer-3': '#7cff6b',
        '--layer-4': '#20fffe', '--layer-5': '#2051ff', '--layer-6': '#9d20ff'
      }
    },
    {
      id: 'nord', name: 'Nord', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#2e3440', '--surface': '#2e3440', '--surface-2': '#3b4252', '--border': '#434c5e',
        '--fg': '#eceff4', '--fg-muted': '#96b1cc', '--accent': '#88c0d0', '--accent-fg': '#2e3440',
        '--note': '#ebcb8b', '--note-selected': '#f5e5c5', '--key-white': '#d5d9de', '--key-black': '#1c1f26',
        '--danger': '#cf898f', '--layer-1': '#ebcb8b', '--layer-2': '#88c0d0', '--layer-3': '#cf898f',
        '--layer-4': '#c0eb8b', '--layer-5': '#8beba1', '--layer-6': '#8b9eeb'
      }
    },
    {
      id: 'one-dark', name: 'One Dark', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#282c34', '--surface': '#282c34', '--surface-2': '#21252b', '--border': '#3e4451',
        '--fg': '#abb2bf', '--fg-muted': '#8e939c', '--accent': '#98c379', '--accent-fg': '#282c34',
        '--note': '#e5c07b', '--note-selected': '#f2e0bd', '--key-white': '#9ba2ae', '--key-black': '#181a1f',
        '--danger': '#e17079', '--layer-1': '#e5c07b', '--layer-2': '#98c379', '--layer-3': '#e17079',
        '--layer-4': '#7be592', '--layer-5': '#7be5e5', '--layer-6': '#7b92e5'
      }
    },
    {
      id: 'ocean-deep', name: 'Ocean Deep', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0b1c26', '--surface': '#102734', '--surface-2': '#163241', '--border': '#24475a',
        '--fg': '#dff1f7', '--fg-muted': '#86aec0', '--accent': '#26c6da', '--accent-fg': '#04262c',
        '--note': '#ffcc66', '--note-selected': '#ffe6b3', '--key-white': '#c6d9e0', '--key-black': '#071117',
        '--danger': '#ff6b6b', '--layer-1': '#ffcc66', '--layer-2': '#26c6da', '--layer-3': '#ff6b6b',
        '--layer-4': '#baff66', '--layer-5': '#66ff8a', '--layer-6': '#6685ff'
      }
    },
    {
      id: 'ocean', name: 'Ocean', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#073642', '--surface': '#073642', '--surface-2': '#0b4652', '--border': '#176b75',
        '--fg': '#d9f3f0', '--fg-muted': '#83b8bd', '--accent': '#5eead4', '--accent-fg': '#073642',
        '--note': '#ffcc66', '--note-selected': '#ffe6b3', '--key-white': '#c0dcdb', '--key-black': '#042028',
        '--danger': '#ff8b8b', '--layer-1': '#ffcc66', '--layer-2': '#5eead4', '--layer-3': '#ff8b8b',
        '--layer-4': '#baff66', '--layer-5': '#66ff8a', '--layer-6': '#6685ff'
      }
    },
    {
      id: 'forest', name: 'Forest', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#17261b', '--surface': '#17261b', '--surface-2': '#223a28', '--border': '#36533b',
        '--fg': '#e6f1d8', '--fg-muted': '#98ae91', '--accent': '#d6f36b', '--accent-fg': '#17261b',
        '--note': '#f29b9b', '--note-selected': '#f9cdcd', '--key-white': '#cdd9c1', '--key-black': '#0e1710',
        '--danger': '#f29b9b', '--layer-1': '#f29b9b', '--layer-2': '#d6f36b', '--layer-3': '#9bf2b9',
        '--layer-4': '#9be6f2', '--layer-5': '#9ba2f2', '--layer-6': '#d89bf2'
      }
    },
    {
      id: 'sunset', name: 'Sunset', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#3a1832', '--surface': '#3a1832', '--surface-2': '#51213b', '--border': '#71324e',
        '--fg': '#fff0dc', '--fg-muted': '#d6a6a1', '--accent': '#ffad69', '--accent-fg': '#3a1832',
        '--note': '#ffb454', '--note-selected': '#ffdaaa', '--key-white': '#e7d6c8', '--key-black': '#230e1e',
        '--danger': '#ff8c82', '--layer-1': '#ffb454', '--layer-2': '#c4ff54', '--layer-3': '#54ff6a',
        '--layer-4': '#54fff0', '--layer-5': '#5488ff', '--layer-6': '#a654ff'
      }
    },
    {
      id: 'ghost-in-the-shell', name: 'Ghost in the Shell', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0a1420', '--surface': '#0d1b2b', '--surface-2': '#142943', '--border': '#1f3a5f',
        '--fg': '#b9e6f2', '--fg-muted': '#6c93af', '--accent': '#29d3c8', '--accent-fg': '#061014',
        '--note': '#ff9f45', '--note-selected': '#ffcfa2', '--key-white': '#a4ceda', '--key-black': '#060c13',
        '--danger': '#ff5470', '--layer-1': '#ff9f45', '--layer-2': '#29d3c8', '--layer-3': '#ff5470',
        '--layer-4': '#cdff45', '--layer-5': '#45ff4e', '--layer-6': '#458cff'
      }
    },
    {
      id: 'cyberpunk', name: 'Cyberpunk', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0d0c1d', '--surface': '#14122b', '--surface-2': '#1e1b3a', '--border': '#322d54',
        '--fg': '#f2f0ff', '--fg-muted': '#8b85b8', '--accent': '#fcee0a', '--accent-fg': '#0d0c1d',
        '--note': '#39ff88', '--note-selected': '#9cffc4', '--key-white': '#d7d5e6', '--key-black': '#080711',
        '--danger': '#ff003c', '--layer-1': '#39ff88', '--layer-2': '#fcee0a', '--layer-3': '#ff8c42',
        '--layer-4': '#ff003c', '--layer-5': '#39dbff', '--layer-6': '#3d44ff'
      }
    },
    {
      id: 'blueprint', name: 'Blueprint', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0b3d67', '--surface': '#0e4a7a', '--surface-2': '#125a91', '--border': '#2b7ab8',
        '--fg': '#eaf4ff', '--fg-muted': '#b0d0e9', '--accent': '#ffffff', '--accent-fg': '#0b3d67',
        '--note': '#ffd166', '--note-selected': '#ffe8b3', '--key-white': '#d0e0ef', '--key-black': '#07253e',
        '--danger': '#ff9999', '--layer-1': '#ffd166', '--layer-2': '#6bffb8', '--layer-3': '#ff9999',
        '--layer-4': '#b5ff66', '--layer-5': '#66f7ff', '--layer-6': '#748bff'
      }
    },
    {
      id: 'dzd', name: 'DZD', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#171523', '--surface': '#1a2b2d', '--surface-2': '#1a2b2d', '--border': '#144157',
        '--fg': '#dce0e5', '--fg-muted': '#9cc4e4', '--accent': '#009dbd', '--accent-fg': '#0e2c3b',
        '--note': '#c6a758', '--note-selected': '#e3d3ac', '--key-white': '#c5cacf', '--key-black': '#0e0d15',
        '--danger': '#d47373', '--layer-1': '#c6a758', '--layer-2': '#009dbd', '--layer-3': '#7463c8',
        '--layer-4': '#d47373', '--layer-5': '#8fc658', '--layer-6': '#58c677'
      }
    },
    {
      id: 'ghost', name: 'Ghost', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#d3d3d3', '--surface': '#ffffff', '--surface-2': '#e4e7eb', '--border': '#c7ccd1',
        '--fg': '#1b1f23', '--fg-muted': '#616874', '--accent': '#111827', '--accent-fg': '#ffffff',
        '--note': '#9a6b12', '--note-selected': '#5f420b', '--key-white': '#ffffff', '--key-black': '#2d3135',
        '--danger': '#c81e35', '--layer-1': '#9a6b12', '--layer-2': '#157a45', '--layer-3': '#2563eb',
        '--layer-4': '#c81e35', '--layer-5': '#5e9a12', '--layer-6': '#12999a'
      }
    },
    {
      id: 'candy', name: 'Candy', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#ffe5f1', '--surface': '#ffe5f1', '--surface-2': '#ffd1e5', '--border': '#e9a8ca',
        '--fg': '#43264f', '--fg-muted': '#7a5674', '--accent': '#c43d82', '--accent-fg': '#ffffff',
        '--note': '#168f78', '--note-selected': '#0e594a', '--key-white': '#ffe5f1', '--key-black': '#56395f',
        '--danger': '#b83c5f', '--layer-1': '#168f78', '--layer-2': '#c43d82', '--layer-3': '#b07c2e',
        '--layer-4': '#16478f', '--layer-5': '#44168f', '--layer-6': '#518f16'
      }
    },
    {
      id: 'citrus', name: 'Citrus', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#f1f5c9', '--surface': '#f1f5c9', '--surface-2': '#e4ed9f', '--border': '#c7d66b',
        '--fg': '#26351c', '--fg-muted': '#606c3c', '--accent': '#d0711e', '--accent-fg': '#000000',
        '--note': '#397c3f', '--note-selected': '#234d27', '--key-white': '#f1f5c9', '--key-black': '#3a482d',
        '--danger': '#b74c35', '--layer-1': '#397c3f', '--layer-2': '#d0711e', '--layer-3': '#397c73',
        '--layer-4': '#39507c', '--layer-5': '#56397c', '--layer-6': '#7c396d'
      }
    },
    {
      id: 'arizona-green-tea', name: 'Arizona Green Tea', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#d7ecd9', '--surface': '#e8f5e9', '--surface-2': '#c3e0c6', '--border': '#9dcaa1',
        '--fg': '#26401f', '--fg-muted': '#4d6547', '--accent': '#e0559a', '--accent-fg': '#000000',
        '--note': '#be4253', '--note-selected': '#762933', '--key-white': '#e8f5e9', '--key-black': '#385132',
        '--danger': '#be4253', '--layer-1': '#be4253', '--layer-2': '#b78130', '--layer-3': '#6e9835',
        '--layer-4': '#379e4c', '--layer-5': '#359898', '--layer-6': '#425dbe'
      }
    },
    {
      id: 'tron', name: 'Tron', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#000a12', '--surface': '#031520', '--surface-2': '#072535', '--border': '#0f4a63',
        '--fg': '#d8f8ff', '--fg-muted': '#6fb6cc', '--accent': '#18e0ff', '--accent-fg': '#00141c',
        '--note': '#ff9a1f', '--note-selected': '#ffd09a', '--key-white': '#bfefff', '--key-black': '#000507',
        '--danger': '#ff5c5c',
        '--layer-1': '#ff9a1f', '--layer-2': '#18e0ff', '--layer-3': '#ffe600',
        '--layer-4': '#ff3dd2', '--layer-5': '#7dff5c', '--layer-6': '#a98bff'
      }
    },
    {
      id: 'adventure-time', name: 'Adventure Time', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#e6f6ff', '--surface': '#ffffff', '--surface-2': '#d3ecfa', '--border': '#9fcbe6',
        '--fg': '#1d2a44', '--fg-muted': '#4d6280', '--accent': '#1a6fae', '--accent-fg': '#ffffff',
        '--note': '#c96f00', '--note-selected': '#7a4300', '--key-white': '#ffffff', '--key-black': '#1d2a44',
        '--danger': '#c62828',
        '--layer-1': '#c96f00', '--layer-2': '#1a6fae', '--layer-3': '#3c8a2e',
        '--layer-4': '#d6408a', '--layer-5': '#7b4fc4', '--layer-6': '#a07800'
      }
    },
    {
      id: 'radioactive', name: 'Radioactive', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0a0d02', '--surface': '#12170a', '--surface-2': '#1c2410', '--border': '#3a4a14',
        '--fg': '#eaffb0', '--fg-muted': '#a2b86a', '--accent': '#ffd400', '--accent-fg': '#1a1400',
        '--note': '#b6ff1a', '--note-selected': '#e2ff9f', '--key-white': '#d9eaa0', '--key-black': '#050700',
        '--danger': '#ff6a4a',
        '--layer-1': '#b6ff1a', '--layer-2': '#ffd400', '--layer-3': '#3dffc5',
        '--layer-4': '#ff8a1e', '--layer-5': '#4dd2ff', '--layer-6': '#e07bff'
      }
    },
    {
      id: 'biohazard', name: 'Biohazard', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#120806', '--surface': '#1b0e0a', '--surface-2': '#2a1610', '--border': '#5a2d1c',
        '--fg': '#ffe9dc', '--fg-muted': '#c9997f', '--accent': '#ff6a13', '--accent-fg': '#1a0800',
        '--note': '#36e6a8', '--note-selected': '#a6f5d8', '--key-white': '#f2d9cc', '--key-black': '#080302',
        '--danger': '#ff5c7a',
        '--layer-1': '#36e6a8', '--layer-2': '#ff6a13', '--layer-3': '#ffd23f',
        '--layer-4': '#6fa8ff', '--layer-5': '#c48bff', '--layer-6': '#ff6fb5'
      }
    },
    {
      id: 'tie-dye', name: 'Tie Dye', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#fff6ec', '--surface': '#ffffff', '--surface-2': '#fbe8f4', '--border': '#e9bfe0',
        '--fg': '#2a1640', '--fg-muted': '#6b4f80', '--accent': '#b5179e', '--accent-fg': '#ffffff',
        '--note': '#0077b6', '--note-selected': '#003f61', '--key-white': '#ffffff', '--key-black': '#2a1640',
        '--danger': '#c1121f',
        '--layer-1': '#0077b6', '--layer-2': '#b5179e', '--layer-3': '#d45500',
        '--layer-4': '#2b8a44', '--layer-5': '#7209b7', '--layer-6': '#008080'
      }
    },
    {
      id: 'military', name: 'Military', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#1a1d12', '--surface': '#23271a', '--surface-2': '#2f3423', '--border': '#4b5334',
        '--fg': '#e3e6cf', '--fg-muted': '#a3a982', '--accent': '#c2b280', '--accent-fg': '#1a1d12',
        '--note': '#e0a43c', '--note-selected': '#f2d29b', '--key-white': '#d8d9c3', '--key-black': '#0e100a',
        '--danger': '#e8706b',
        '--layer-1': '#e0a43c', '--layer-2': '#8fbf5a', '--layer-3': '#6fa3c9',
        '--layer-4': '#d07a5a', '--layer-5': '#c2b280', '--layer-6': '#a597d8'
      }
    },
    {
      id: 'akira', name: 'Akira', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0d0a0e', '--surface': '#160f14', '--surface-2': '#23161d', '--border': '#4a2230',
        '--fg': '#f4ece6', '--fg-muted': '#b49a9a', '--accent': '#ee2e22', '--accent-fg': '#000000',
        '--note': '#ffcb2b', '--note-selected': '#ffe69a', '--key-white': '#ece2dc', '--key-black': '#060405',
        '--danger': '#ff6b81',
        '--layer-1': '#ffcb2b', '--layer-2': '#e8352c', '--layer-3': '#2fd0ff',
        '--layer-4': '#8cff6a', '--layer-5': '#ff7bd5', '--layer-6': '#b88cff'
      }
    },
    {
      id: 'autumn', name: 'Autumn', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#1f140d', '--surface': '#2a1b11', '--surface-2': '#3a2617', '--border': '#5e3e24',
        '--fg': '#f6e6d3', '--fg-muted': '#c4a585', '--accent': '#e2711d', '--accent-fg': '#1f140d',
        '--note': '#f2c14e', '--note-selected': '#f9e2a8', '--key-white': '#efdcc6', '--key-black': '#120b06',
        '--danger': '#ff7a6b',
        '--layer-1': '#f2c14e', '--layer-2': '#e2711d', '--layer-3': '#e0644f',
        '--layer-4': '#9ab85a', '--layer-5': '#c79be0', '--layer-6': '#7fb3c9'
      }
    },
    {
      id: 'spring', name: 'Spring', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#f3fbf2', '--surface': '#ffffff', '--surface-2': '#e5f5e3', '--border': '#bfe0bc',
        '--fg': '#1f3324', '--fg-muted': '#557060', '--accent': '#237a45', '--accent-fg': '#ffffff',
        '--note': '#d63384', '--note-selected': '#85194f', '--key-white': '#ffffff', '--key-black': '#1f3324',
        '--danger': '#c0392b',
        '--layer-1': '#d63384', '--layer-2': '#237a45', '--layer-3': '#2b6fd6',
        '--layer-4': '#9a6d00', '--layer-5': '#7b4fc4', '--layer-6': '#0a8080'
      }
    },
    {
      id: 'jazz-cup', name: 'Jazz Cup', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#f8f8fb', '--surface': '#ffffff', '--surface-2': '#ecebf5', '--border': '#c9c6de',
        '--fg': '#1d1b33', '--fg-muted': '#5a5778', '--accent': '#5b2a86', '--accent-fg': '#ffffff',
        '--note': '#00838f', '--note-selected': '#004d54', '--key-white': '#ffffff', '--key-black': '#1d1b33',
        '--danger': '#c62828',
        '--layer-1': '#00838f', '--layer-2': '#5b2a86', '--layer-3': '#2e6fd9',
        '--layer-4': '#c2185b', '--layer-5': '#d84a00', '--layer-6': '#2e7d32'
      }
    },
    {
      id: 'gunmetal', name: 'Gunmetal', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#1b1f23', '--surface': '#24292e', '--surface-2': '#2f353b', '--border': '#444c55',
        '--fg': '#e6e9ec', '--fg-muted': '#a0a8b1', '--accent': '#8fa4b8', '--accent-fg': '#14181c',
        '--note': '#d4a95a', '--note-selected': '#ecd3a3', '--key-white': '#d5d9dd', '--key-black': '#0d0f11',
        '--danger': '#ff7b7b',
        '--layer-1': '#d4a95a', '--layer-2': '#8fa4b8', '--layer-3': '#6fcf97',
        '--layer-4': '#e07a7a', '--layer-5': '#b39ddb', '--layer-6': '#5ec4d6'
      }
    },
    {
      id: 'diablo', name: 'Diablo', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0c0505', '--surface': '#150808', '--surface-2': '#220c0b', '--border': '#4d1a14',
        '--fg': '#f2e1cf', '--fg-muted': '#b3907a', '--accent': '#d42222', '--accent-fg': '#ffffff',
        '--note': '#e8b04a', '--note-selected': '#f4d896', '--key-white': '#e8d6c2', '--key-black': '#050202',
        '--danger': '#ff6a4d',
        '--layer-1': '#e8b04a', '--layer-2': '#ff4433', '--layer-3': '#ff8c1a',
        '--layer-4': '#b07cff', '--layer-5': '#4fc3f7', '--layer-6': '#9ccc65'
      }
    },
    {
      id: 'tropical', name: 'Tropical', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#fff8ec', '--surface': '#ffffff', '--surface-2': '#e6f7f4', '--border': '#a8ddd4',
        '--fg': '#13343b', '--fg-muted': '#4a6f75', '--accent': '#00796b', '--accent-fg': '#ffffff',
        '--note': '#e8461a', '--note-selected': '#8f2a0c', '--key-white': '#ffffff', '--key-black': '#13343b',
        '--danger': '#c62828',
        '--layer-1': '#e8461a', '--layer-2': '#00796b', '--layer-3': '#d81b60',
        '--layer-4': '#1e78d0', '--layer-5': '#558b2f', '--layer-6': '#8e24aa'
      }
    },
    {
      id: 'peaches-and-cream', name: 'Peaches & Cream', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#fff4ea', '--surface': '#fffaf5', '--surface-2': '#fde3d0', '--border': '#f2c3a3',
        '--fg': '#3d2418', '--fg-muted': '#7a5644', '--accent': '#a14e2c', '--accent-fg': '#ffffff',
        '--note': '#d95f4b', '--note-selected': '#7f2f22', '--key-white': '#fffdfa', '--key-black': '#3d2418',
        '--danger': '#b3261e',
        '--layer-1': '#d95f4b', '--layer-2': '#a14e2c', '--layer-3': '#a87414',
        '--layer-4': '#5f8434', '--layer-5': '#4f7cac', '--layer-6': '#9b59b6'
      }
    },
    {
      id: 'pnw', name: 'PNW', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#121a19', '--surface': '#18231f', '--surface-2': '#22302b', '--border': '#36483f',
        '--fg': '#e2ebe6', '--fg-muted': '#9fb3aa', '--accent': '#6fbf8e', '--accent-fg': '#0f1a14',
        '--note': '#ff8f6b', '--note-selected': '#ffc7b5', '--key-white': '#d4dfd9', '--key-black': '#090e0d',
        '--danger': '#ff7a7a',
        '--layer-1': '#ff8f6b', '--layer-2': '#6fbf8e', '--layer-3': '#7fb2d9',
        '--layer-4': '#e6c86e', '--layer-5': '#b39ddb', '--layer-6': '#4fd1c5'
      }
    },
    {
      id: 'bumblebee', name: 'Bumblebee', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#121006', '--surface': '#1b180a', '--surface-2': '#2a2510', '--border': '#4f4618',
        '--fg': '#fff6cc', '--fg-muted': '#c9bb7a', '--accent': '#ffc800', '--accent-fg': '#121006',
        '--note': '#b48cff', '--note-selected': '#dbc8ff', '--key-white': '#f2ead0', '--key-black': '#070602',
        '--danger': '#ff6b6b',
        '--layer-1': '#b48cff', '--layer-2': '#ffc800', '--layer-3': '#ff8a3d',
        '--layer-4': '#7dd87d', '--layer-5': '#6fc3ff', '--layer-6': '#ff7eb6'
      }
    },
    {
      id: 'american-southwest', name: 'American Southwest', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#f6ead8', '--surface': '#fbf3e7', '--surface-2': '#ecd9bf', '--border': '#d4b48f',
        '--fg': '#3a2516', '--fg-muted': '#75553a', '--accent': '#a8401f', '--accent-fg': '#ffffff',
        '--note': '#1f7a7a', '--note-selected': '#0f4040', '--key-white': '#fffaf2', '--key-black': '#3a2516',
        '--danger': '#b3261e',
        '--layer-1': '#1f7a7a', '--layer-2': '#a8401f', '--layer-3': '#9c6b10',
        '--layer-4': '#557a2e', '--layer-5': '#6b4fa0', '--layer-6': '#2f5f9e'
      }
    },
    {
      id: 'park-ranger', name: 'National Park Ranger', group: 'Light', scheme: 'light',
      vars: {
        '--bg': '#efe8d6', '--surface': '#f8f3e6', '--surface-2': '#e4dac2', '--border': '#c8b993',
        '--fg': '#2b2a1c', '--fg-muted': '#625d43', '--accent': '#3f5b2e', '--accent-fg': '#ffffff',
        '--note': '#8b4513', '--note-selected': '#4d2609', '--key-white': '#fffcf3', '--key-black': '#2b2a1c',
        '--danger': '#b3261e',
        '--layer-1': '#8b4513', '--layer-2': '#3f5b2e', '--layer-3': '#2f6b8f',
        '--layer-4': '#8a6a10', '--layer-5': '#6d4c8f', '--layer-6': '#2e7d6a'
      }
    },
    {
      id: 'halloween', name: 'Halloween', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#100a14', '--surface': '#180f1e', '--surface-2': '#24162d', '--border': '#45294f',
        '--fg': '#f6ecff', '--fg-muted': '#b39cc6', '--accent': '#ff7a00', '--accent-fg': '#140800',
        '--note': '#8cff3c', '--note-selected': '#c8ff9f', '--key-white': '#ece0f5', '--key-black': '#070409',
        '--danger': '#ff5c7c',
        '--layer-1': '#8cff3c', '--layer-2': '#ff7a00', '--layer-3': '#b96bff',
        '--layer-4': '#ffe14d', '--layer-5': '#ff5fa2', '--layer-6': '#5fd7ff'
      }
    },
    {
      id: 'xmas', name: 'X-mas', group: 'Dark', scheme: 'dark',
      vars: {
        '--bg': '#0b1a12', '--surface': '#10241a', '--surface-2': '#183326', '--border': '#2c5241',
        '--fg': '#f3f7f2', '--fg-muted': '#a7bfb1', '--accent': '#e0303a', '--accent-fg': '#ffffff',
        '--note': '#f5c542', '--note-selected': '#fae29c', '--key-white': '#eef3ee', '--key-black': '#050c08',
        '--danger': '#ff7a7a',
        '--layer-1': '#f5c542', '--layer-2': '#ff4d57', '--layer-3': '#7fd1a8',
        '--layer-4': '#8fb8ff', '--layer-5': '#ff9fc6', '--layer-6': '#c9a2ff'
      }
    }
  ];

  var byId = {};
  for (var i = 0; i < THEMES.length; i++) byId[THEMES[i].id] = THEMES[i];
  var VAR_NAMES = Object.keys(byId.paper.vars);

  function fullVars(theme) {
    var base = theme.scheme === 'dark' ? byId.midnight.vars : byId.paper.vars;
    var out = {};
    for (var j = 0; j < VAR_NAMES.length; j++) {
      var k = VAR_NAMES[j];
      out[k] = theme.vars[k] || base[k];
    }
    return out;
  }

  function block(selector, theme) {
    var v = fullVars(theme), s = selector + '{';
    for (var k in v) s += k + ':' + v[k] + ';';
    return s + 'color-scheme:' + theme.scheme + ';}';
  }

  // One <style> with a block per theme. Bare :root and the host's
  // light/dark attribute values fall back to Paper / Midnight.
  var css = block(':root', byId.paper);
  css += block('[data-theme="light"]', byId.paper);
  css += block('[data-theme="dark"]', byId.midnight);
  for (var t = 0; t < THEMES.length; t++) css += block('[data-theme="' + THEMES[t].id + '"]', THEMES[t]);
  var style = document.createElement('style');
  style.id = 'bleepr-themes';
  style.textContent = css;
  document.head.appendChild(style);

  function readChoice() {
    var id = null;
    try { id = localStorage.getItem(STORAGE_KEY); } catch (e) { /* storage blocked */ }
    // A saved theme that no longer exists falls back to System.
    return id && byId[id] ? id : SYSTEM;
  }
  function writeChoice(id) {
    try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* storage blocked */ }
  }

  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function resolve(id) {
    if (id === SYSTEM || !byId[id]) return mq && mq.matches ? 'midnight' : 'paper';
    return id;
  }

  var root = document.documentElement;
  var applied = null;
  var choice = readChoice();

  function apply(id) {
    var real = resolve(id);
    applied = real;
    root.setAttribute('data-theme', real);
    root.classList.toggle('dark', byId[real].scheme === 'dark');
    try { document.dispatchEvent(new CustomEvent('themechange', { detail: { id: id, resolved: real } })); } catch (e) { /* old browser */ }
    return real;
  }

  apply(choice);

  // Follow the OS while "System (auto)" is chosen.
  if (mq) {
    var onOs = function () { if (choice === SYSTEM) apply(SYSTEM); };
    if (mq.addEventListener) mq.addEventListener('change', onOs); else if (mq.addListener) mq.addListener(onOs);
  }

  // If something else rewrites data-theme (an embedding host), put ours back.
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (root.getAttribute('data-theme') !== applied) apply(choice);
    }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  window.BleeprThemes = {
    SYSTEM: SYSTEM,
    list: THEMES,
    get: function (id) { return byId[id] || null; },
    vars: function (id) { return fullVars(byId[resolve(id)]); },
    resolve: resolve,
    choice: function () { return choice; },
    // Preview without saving.
    preview: function (id) { return apply(id); },
    // Choose and save.
    set: function (id) { choice = byId[id] || id === SYSTEM ? id : SYSTEM; writeChoice(choice); return apply(choice); },
    restore: function () { return apply(choice); }
  };
})();
