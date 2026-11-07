import {
  BookOpen,
  Coffee,
  Crown,
  Flame,
  Folder,
  Ghost,
  Heart,
  KeyRound,
  MessageCircle,
  Moon,
  Music,
  Shield,
  Sparkles,
  Star,
  Sun,
  Sword,
  Users,
  type LucideIcon
} from 'lucide-react'

export const FOLDER_ICONS: { key: string; icon: LucideIcon; label: string }[] = [
  { key: 'folder', icon: Folder, label: 'Folder' },
  { key: 'heart', icon: Heart, label: 'Heart' },
  { key: 'star', icon: Star, label: 'Star' },
  { key: 'flame', icon: Flame, label: 'Flame' },
  { key: 'sparkles', icon: Sparkles, label: 'Sparkles' },
  { key: 'crown', icon: Crown, label: 'Crown' },
  { key: 'sword', icon: Sword, label: 'Sword' },
  { key: 'shield', icon: Shield, label: 'Shield' },
  { key: 'moon', icon: Moon, label: 'Moon' },
  { key: 'sun', icon: Sun, label: 'Sun' },
  { key: 'ghost', icon: Ghost, label: 'Ghost' },
  { key: 'users', icon: Users, label: 'Users' },
  { key: 'message-circle', icon: MessageCircle, label: 'Chat' },
  { key: 'book-open', icon: BookOpen, label: 'Book' },
  { key: 'key-round', icon: KeyRound, label: 'Key' },
  { key: 'coffee', icon: Coffee, label: 'Coffee' },
  { key: 'music', icon: Music, label: 'Music' }
]

const ICON_BY_KEY = new Map(FOLDER_ICONS.map((entry) => [entry.key, entry.icon]))

export function getFolderIcon(key: string | null): LucideIcon {
  return (key && ICON_BY_KEY.get(key)) || Folder
}

/** §6 color swatch palette. Stored as a hex string on folders.color. */
export const FOLDER_COLORS = [
  '#8b5cf6', // accent purple (default-ish)
  '#e5484d', // red
  '#f5a524', // amber
  '#3dd68c', // green
  '#22b8cf', // teal
  '#4f8ff7', // blue
  '#d6409f', // pink
  '#a9a7b4', // neutral gray
  '#c2410c', // burnt orange
  '#65a30d' // olive
]
