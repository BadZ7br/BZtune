export type Album = {
  id: string;
  title: string;
  artist: string;
  year: number;
  genre: string;
  mood: string;
  description: string;
  cover: string;
  coverUrl?: string;
  accent: string;
};

export const albums: Album[] = [
  {
    id: "blood-lust",
    title: "Blood Lust",
    artist: "Uncle Acid & The Deadbeats",
    year: 2011,
    genre: "Psychedelic Doom",
    mood: "Sombrio e melancólico",
    description: "Riffs fuzzados, clima de horror vintage e psicodelia obscura.",
    cover: "cover-red",
    accent: "#713c39",
  },
  {
    id: "master-reality",
    title: "Master of Reality",
    artist: "Black Sabbath",
    year: 1971,
    genre: "Doom Metal",
    mood: "Pesado e arrastado",
    description: "Um clássico de riffs densos que ajudou a definir o doom.",
    cover: "cover-grey",
    accent: "#56585a",
  },
  {
    id: "soma",
    title: "Soma",
    artist: "Windhand",
    year: 2013,
    genre: "Doom / Stoner",
    mood: "Melancólico e enevoado",
    description: "Camadas lentas, guitarras densas e vocais etéreos.",
    cover: "cover-purple",
    accent: "#57415f",
  },
  {
    id: "sky-valley",
    title: "Welcome to Sky Valley",
    artist: "Kyuss",
    year: 1994,
    genre: "Stoner Rock",
    mood: "Desértico e viajante",
    description: "Groove quente, fuzz e a sensação de atravessar um deserto.",
    cover: "cover-sand",
    accent: "#8c7352",
  },
  {
    id: "dopethrone",
    title: "Dopethrone",
    artist: "Electric Wizard",
    year: 2000,
    genre: "Stoner / Doom",
    mood: "Denso e abrasivo",
    description: "Um mergulho em riffs lentos, distorção e peso subterrâneo.",
    cover: "cover-green",
    accent: "#4f5b40",
  },
  {
    id: "sleep-holy-mountain",
    title: "Sleep's Holy Mountain",
    artist: "Sleep",
    year: 1992,
    genre: "Stoner Doom",
    mood: "Ritualístico e pesado",
    description: "Repetição hipnótica, fuzz e uma atmosfera quase ritual.",
    cover: "cover-blue",
    accent: "#455765",
  },
];

export const moods = ["Todos os climas", ...new Set(albums.map((album) => album.mood))];
export const genres = ["Todos os gêneros", ...new Set(albums.map((album) => album.genre))];