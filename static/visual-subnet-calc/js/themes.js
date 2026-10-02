var THEMES = [
  {
    id: 'paper', name: 'Paper', group: 'Standard', scheme: 'light',
    vars: {
      '--bg': '#f6f5f1', '--surface': '#ffffff', '--surface-2': '#ebeae4', '--border': '#d4d2c8',
      '--fg': '#1b1c1f', '--fg-muted': '#62646b', '--accent': '#2f6fed', '--accent-fg': '#ffffff',
      '--danger': '#c62f3a'
    }
  },
  {
    id: 'midnight', name: 'Midnight', group: 'Standard', scheme: 'dark',
    vars: {
      '--bg': '#14161a', '--surface': '#1d2026', '--surface-2': '#272b33', '--border': '#363b45',
      '--fg': '#e8e9ec', '--fg-muted': '#9aa0ab', '--accent': '#6c9bff', '--accent-fg': '#0b1020',
      '--danger': '#ff7a85'
    }
  },
  {
    id: 'high-contrast', name: 'High Contrast', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#000000', '--surface': '#000000', '--surface-2': '#000000', '--border': '#ffffff',
      '--fg': '#ffffff', '--fg-muted': '#cccccc', '--accent': '#ffff00', '--accent-fg': '#000000',
      '--danger': '#ff3333'
    }
  },
  {
    id: 'matrix', name: 'Matrix', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#020803', '--surface': '#04140a', '--surface-2': '#0a2415', '--border': '#1c4d2e',
      '--fg': '#c9ffd8', '--fg-muted': '#5f9c74', '--accent': '#39ff6a', '--accent-fg': '#03150a',
      '--danger': '#ff3b3b'
    }
  },
  {
    id: 'synthwave', name: 'Synthwave', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#170822', '--surface': '#200f33', '--surface-2': '#2c1447', '--border': '#5a2c82',
      '--fg': '#f5e8ff', '--fg-muted': '#b98fd8', '--accent': '#ff2fd6', '--accent-fg': '#1a0620',
      '--danger': '#ff4d6d'
    }
  },
  {
    id: 'terminal', name: 'Terminal', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0a0700', '--surface': '#161000', '--surface-2': '#221800', '--border': '#4d3800',
      '--fg': '#ffce6b', '--fg-muted': '#a67f34', '--accent': '#ffb000', '--accent-fg': '#160f00',
      '--danger': '#ff4d3d'
    }
  },
  {
    id: 'blood', name: 'Blood', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0a0000', '--surface': '#160303', '--surface-2': '#220505', '--border': '#5c0f0f',
      '--fg': '#ffd6d6', '--fg-muted': '#b06666', '--accent': '#ff3355', '--accent-fg': '#160303',
      '--danger': '#ff0022'
    }
  },
  {
    id: 'nord', name: 'Nord', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#2e3440', '--surface': '#2e3440', '--surface-2': '#3b4252', '--border': '#434c5e',
      '--fg': '#eceff4', '--fg-muted': '#96b1cc', '--accent': '#88c0d0', '--accent-fg': '#2e3440',
      '--danger': '#cf898f'
    }
  },
  {
    id: 'one-dark', name: 'One Dark', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#282c34', '--surface': '#282c34', '--surface-2': '#21252b', '--border': '#3e4451',
      '--fg': '#abb2bf', '--fg-muted': '#8e939c', '--accent': '#98c379', '--accent-fg': '#282c34',
      '--danger': '#e17079'
    }
  },
  {
    id: 'ocean-deep', name: 'Ocean Deep', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0b1c26', '--surface': '#102734', '--surface-2': '#163241', '--border': '#24475a',
      '--fg': '#dff1f7', '--fg-muted': '#86aec0', '--accent': '#26c6da', '--accent-fg': '#04262c',
      '--danger': '#ff6b6b'
    }
  },
  {
    id: 'ocean', name: 'Ocean', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#073642', '--surface': '#073642', '--surface-2': '#0b4652', '--border': '#176b75',
      '--fg': '#d9f3f0', '--fg-muted': '#83b8bd', '--accent': '#5eead4', '--accent-fg': '#073642',
      '--danger': '#ff8b8b'
    }
  },
  {
    id: 'forest', name: 'Forest', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#17261b', '--surface': '#17261b', '--surface-2': '#223a28', '--border': '#36533b',
      '--fg': '#e6f1d8', '--fg-muted': '#98ae91', '--accent': '#d6f36b', '--accent-fg': '#17261b',
      '--danger': '#f29b9b'
    }
  },
  {
    id: 'sunset', name: 'Sunset', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#3a1832', '--surface': '#3a1832', '--surface-2': '#51213b', '--border': '#71324e',
      '--fg': '#fff0dc', '--fg-muted': '#d6a6a1', '--accent': '#ffad69', '--accent-fg': '#3a1832',
      '--danger': '#ff8c82'
    }
  },
  {
    id: 'ghost-in-the-shell', name: 'Ghost in the Shell', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0a1420', '--surface': '#0d1b2b', '--surface-2': '#142943', '--border': '#1f3a5f',
      '--fg': '#b9e6f2', '--fg-muted': '#6c93af', '--accent': '#29d3c8', '--accent-fg': '#061014',
      '--danger': '#ff5470'
    }
  },
  {
    id: 'cyberpunk', name: 'Cyberpunk', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0d0c1d', '--surface': '#14122b', '--surface-2': '#1e1b3a', '--border': '#322d54',
      '--fg': '#f2f0ff', '--fg-muted': '#8b85b8', '--accent': '#fcee0a', '--accent-fg': '#0d0c1d',
      '--danger': '#ff003c'
    }
  },
  {
    id: 'blueprint', name: 'Blueprint', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0b3d67', '--surface': '#0e4a7a', '--surface-2': '#125a91', '--border': '#2b7ab8',
      '--fg': '#eaf4ff', '--fg-muted': '#b0d0e9', '--accent': '#ffffff', '--accent-fg': '#0b3d67',
      '--danger': '#ff9999'
    }
  },
  {
    id: 'dzd', name: 'DZD', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#171523', '--surface': '#1a2b2d', '--surface-2': '#1a2b2d', '--border': '#144157',
      '--fg': '#dce0e5', '--fg-muted': '#9cc4e4', '--accent': '#009dbd', '--accent-fg': '#0e2c3b',
      '--danger': '#d47373'
    }
  },
  {
    id: 'ghost', name: 'Ghost', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#d3d3d3', '--surface': '#ffffff', '--surface-2': '#e4e7eb', '--border': '#c7ccd1',
      '--fg': '#1b1f23', '--fg-muted': '#616874', '--accent': '#111827', '--accent-fg': '#ffffff',
      '--danger': '#c81e35'
    }
  },
  {
    id: 'candy', name: 'Candy', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#ffe5f1', '--surface': '#ffe5f1', '--surface-2': '#ffd1e5', '--border': '#e9a8ca',
      '--fg': '#43264f', '--fg-muted': '#7a5674', '--accent': '#c43d82', '--accent-fg': '#ffffff',
      '--danger': '#b83c5f'
    }
  },
  {
    id: 'citrus', name: 'Citrus', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#f1f5c9', '--surface': '#f1f5c9', '--surface-2': '#e4ed9f', '--border': '#c7d66b',
      '--fg': '#26351c', '--fg-muted': '#606c3c', '--accent': '#d0711e', '--accent-fg': '#000000',
      '--danger': '#b74c35'
    }
  },
  {
    id: 'arizona-green-tea', name: 'Arizona Green Tea', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#d7ecd9', '--surface': '#e8f5e9', '--surface-2': '#c3e0c6', '--border': '#9dcaa1',
      '--fg': '#26401f', '--fg-muted': '#4d6547', '--accent': '#e0559a', '--accent-fg': '#000000',
      '--danger': '#be4253'
    }
  },
  {
    id: 'tron', name: 'Tron', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#000a12', '--surface': '#031520', '--surface-2': '#072535', '--border': '#0f4a63',
      '--fg': '#d8f8ff', '--fg-muted': '#6fb6cc', '--accent': '#18e0ff', '--accent-fg': '#00141c',
      '--danger': '#ff5c5c'
    }
  },
  {
    id: 'adventure-time', name: 'Adventure Time', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#e6f6ff', '--surface': '#ffffff', '--surface-2': '#d3ecfa', '--border': '#9fcbe6',
      '--fg': '#1d2a44', '--fg-muted': '#4d6280', '--accent': '#1a6fae', '--accent-fg': '#ffffff',
      '--danger': '#c62828'
    }
  },
  {
    id: 'radioactive', name: 'Radioactive', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0a0d02', '--surface': '#12170a', '--surface-2': '#1c2410', '--border': '#3a4a14',
      '--fg': '#eaffb0', '--fg-muted': '#a2b86a', '--accent': '#ffd400', '--accent-fg': '#1a1400',
      '--danger': '#ff6a4a'
    }
  },
  {
    id: 'biohazard', name: 'Biohazard', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#120806', '--surface': '#1b0e0a', '--surface-2': '#2a1610', '--border': '#5a2d1c',
      '--fg': '#ffe9dc', '--fg-muted': '#c9997f', '--accent': '#ff6a13', '--accent-fg': '#1a0800',
      '--danger': '#ff5c7a'
    }
  },
  {
    id: 'tie-dye', name: 'Tie Dye', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#fff6ec', '--surface': '#ffffff', '--surface-2': '#fbe8f4', '--border': '#e9bfe0',
      '--fg': '#2a1640', '--fg-muted': '#6b4f80', '--accent': '#b5179e', '--accent-fg': '#ffffff',
      '--danger': '#c1121f'
    }
  },
  {
    id: 'military', name: 'Military', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#1a1d12', '--surface': '#23271a', '--surface-2': '#2f3423', '--border': '#4b5334',
      '--fg': '#e3e6cf', '--fg-muted': '#a3a982', '--accent': '#c2b280', '--accent-fg': '#1a1d12',
      '--danger': '#e8706b'
    }
  },
  {
    id: 'akira', name: 'Akira', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0d0a0e', '--surface': '#160f14', '--surface-2': '#23161d', '--border': '#4a2230',
      '--fg': '#f4ece6', '--fg-muted': '#b49a9a', '--accent': '#ee2e22', '--accent-fg': '#000000',
      '--danger': '#ff6b81'
    }
  },
  {
    id: 'autumn', name: 'Autumn', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#1f140d', '--surface': '#2a1b11', '--surface-2': '#3a2617', '--border': '#5e3e24',
      '--fg': '#f6e6d3', '--fg-muted': '#c4a585', '--accent': '#e2711d', '--accent-fg': '#1f140d',
      '--danger': '#ff7a6b'
    }
  },
  {
    id: 'spring', name: 'Spring', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#f3fbf2', '--surface': '#ffffff', '--surface-2': '#e5f5e3', '--border': '#bfe0bc',
      '--fg': '#1f3324', '--fg-muted': '#557060', '--accent': '#237a45', '--accent-fg': '#ffffff',
      '--danger': '#c0392b'
    }
  },
  {
    id: 'jazz-cup', name: 'Jazz Cup', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#f8f8fb', '--surface': '#ffffff', '--surface-2': '#ecebf5', '--border': '#c9c6de',
      '--fg': '#1d1b33', '--fg-muted': '#5a5778', '--accent': '#5b2a86', '--accent-fg': '#ffffff',
      '--danger': '#c62828'
    }
  },
  {
    id: 'gunmetal', name: 'Gunmetal', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#1b1f23', '--surface': '#24292e', '--surface-2': '#2f353b', '--border': '#444c55',
      '--fg': '#e6e9ec', '--fg-muted': '#a0a8b1', '--accent': '#8fa4b8', '--accent-fg': '#14181c',
      '--danger': '#ff7b7b'
    }
  },
  {
    id: 'diablo', name: 'Diablo', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0c0505', '--surface': '#150808', '--surface-2': '#220c0b', '--border': '#4d1a14',
      '--fg': '#f2e1cf', '--fg-muted': '#b3907a', '--accent': '#d42222', '--accent-fg': '#ffffff',
      '--danger': '#ff6a4d'
    }
  },
  {
    id: 'tropical', name: 'Tropical', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#fff8ec', '--surface': '#ffffff', '--surface-2': '#e6f7f4', '--border': '#a8ddd4',
      '--fg': '#13343b', '--fg-muted': '#4a6f75', '--accent': '#00796b', '--accent-fg': '#ffffff',
      '--danger': '#c62828'
    }
  },
  {
    id: 'peaches-and-cream', name: 'Peaches & Cream', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#fff4ea', '--surface': '#fffaf5', '--surface-2': '#fde3d0', '--border': '#f2c3a3',
      '--fg': '#3d2418', '--fg-muted': '#7a5644', '--accent': '#a14e2c', '--accent-fg': '#ffffff',
      '--danger': '#b3261e'
    }
  },
  {
    id: 'pnw', name: 'PNW', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#121a19', '--surface': '#18231f', '--surface-2': '#22302b', '--border': '#36483f',
      '--fg': '#e2ebe6', '--fg-muted': '#9fb3aa', '--accent': '#6fbf8e', '--accent-fg': '#0f1a14',
      '--danger': '#ff7a7a'
    }
  },
  {
    id: 'bumblebee', name: 'Bumblebee', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#121006', '--surface': '#1b180a', '--surface-2': '#2a2510', '--border': '#4f4618',
      '--fg': '#fff6cc', '--fg-muted': '#c9bb7a', '--accent': '#ffc800', '--accent-fg': '#121006',
      '--danger': '#ff6b6b'
    }
  },
  {
    id: 'american-southwest', name: 'American Southwest', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#f6ead8', '--surface': '#fbf3e7', '--surface-2': '#ecd9bf', '--border': '#d4b48f',
      '--fg': '#3a2516', '--fg-muted': '#75553a', '--accent': '#a8401f', '--accent-fg': '#ffffff',
      '--danger': '#b3261e'
    }
  },
  {
    id: 'park-ranger', name: 'National Park Ranger', group: 'Light', scheme: 'light',
    vars: {
      '--bg': '#efe8d6', '--surface': '#f8f3e6', '--surface-2': '#e4dac2', '--border': '#c8b993',
      '--fg': '#2b2a1c', '--fg-muted': '#625d43', '--accent': '#3f5b2e', '--accent-fg': '#ffffff',
      '--danger': '#b3261e'
    }
  },
  {
    id: 'halloween', name: 'Halloween', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#100a14', '--surface': '#180f1e', '--surface-2': '#24162d', '--border': '#45294f',
      '--fg': '#f6ecff', '--fg-muted': '#b39cc6', '--accent': '#ff7a00', '--accent-fg': '#140800',
      '--danger': '#ff5c7c'
    }
  },
  {
    id: 'xmas', name: 'X-mas', group: 'Dark', scheme: 'dark',
    vars: {
      '--bg': '#0b1a12', '--surface': '#10241a', '--surface-2': '#183326', '--border': '#2c5241',
      '--fg': '#f3f7f2', '--fg-muted': '#a7bfb1', '--accent': '#e0303a', '--accent-fg': '#ffffff',
      '--danger': '#ff7a7a'
    }
  }
];
