// Built-in examples. Traditional and public-domain melodies only.

export const EXAMPLES = [
  {
    id: 'ode',
    title: 'Ode to Joy',
    note: 'Beethoven, 1824. One layer.',
    text: `RTMX1|bpm=140|m=8|name=Ode%20to%20Joy
Brickphone(40,55,80)~Ode:d=4,o=5,b=140:e,e,f,g,g,f,e,d,c,c,d,e,e.,8d,2d,e,e,f,g,g,f,e,d,c,c,d,e,d.,8c,2c`,
  },
  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle',
    note: 'Traditional. Melody plus a bass layer.',
    text: `RTMX1|bpm=110|m=4|name=Twinkle
LobbyBeep(30,60,85)~Melody:d=4,o=5,b=110:c,c,g,g,a,a,2g,f,f,e,e,d,d,2c
GlassFM(20,30,55)~Bass:d=2,o=4,b=110:c,e,f,e,f,c,g,c`,
  },
  {
    id: 'jacques',
    title: 'Frère Jacques',
    note: 'Traditional round. Three layers that loop forever.',
    text: `RTMX1|bpm=120|m=8|name=Jacques
Brickphone(35,50,75)~Voice 1:d=4,o=5,b=120:c,d,e,c,c,d,e,c,e,f,2g,e,f,2g,8g,8a,8g,8f,e,c,8g,8a,8g,8f,e,c,c,g4,2c,c,g4,2c
GlassFM(30,45,60)~Voice 2:d=4,o=6,b=120:c,g5,2c,c,g5,2c,c,d,e,c,c,d,e,c,e,f,2g,e,f,2g,8g,8a,8g,8f,e,c,8g,8a,8g,8f,e,c
DialUpDream(40,40,60)~Voice 3:d=4,o=5,b=120:8g,8a,8g,8f,e,c,8g,8a,8g,8f,e,c,c,g4,2c,c,g4,2c,c,d,e,c,c,d,e,c,e,f,2g,e,f,2g`,
  },
  {
    id: 'elise',
    title: 'Für Elise',
    note: 'Beethoven, 1810. Opening phrase.',
    text: `RTMX1|bpm=100|m=4|name=Fur%20Elise
PocketPiezo(45,55,75)~Elise:d=16,o=6,b=100:e,d#,e,d#,e,b5,d,c,8a5,p,c5,e5,a5,8b5,p,e5,g#5,b5,8c,p,e5,e,d#,e,d#,e,b5,d,c,8a5,p,c5,e5,a5,8b5,p,e5,c,b5,4a5`,
  },
];
