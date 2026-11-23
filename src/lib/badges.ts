/** Badge keys match public.dog_badges() in the turf game migration. */
export const BADGES: { key: string; icon: string; name: string; how: string }[] = [
  { key: "alpha_day", icon: "👑", name: "Alpha of the Day", how: "Most points in a day" },
  { key: "alpha_week", icon: "🏆", name: "Alpha of the Week", how: "Most points in a week" },
  { key: "alpha_month", icon: "💎", name: "Alpha of the Month", how: "Most points in a month" },
  { key: "fire", icon: "🔥", name: "Fire Dog", how: "Mark a fire hydrant" },
  { key: "tuff", icon: "💪", name: "Tuff Stuff", how: "Mark a lamp post or pole" },
  { key: "park", icon: "🌳", name: "Park Life", how: "Mark at a dog park" },
  { key: "nomad", icon: "🧭", name: "Nomad", how: "First dog ever to mark a block" },
  { key: "on_a_roll", icon: "📅", name: "On a Roll", how: "Mark 7 days in a row" },
  { key: "night_owl", icon: "🦉", name: "Night Owl", how: "Mark after 10 PM" },
  { key: "early_bird", icon: "🐦", name: "Early Bird", how: "Mark before 6 AM" },
  { key: "first_mark", icon: "🐾", name: "First Mark", how: "Make your first mark" },
];

export const badgeByKey = (key: string) => BADGES.find((b) => b.key === key);
