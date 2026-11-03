/**
 * Single place for UI icons: Font Awesome (react-icons/fa) + shared sizes.
 */
import type { IconType } from 'react-icons'
export type { IconType }
export {
  FaAlignCenter,
  FaAlignJustify,
  FaAlignLeft,
  FaAlignRight,
  FaArrowsAlt,
  FaBold,
  FaChevronDown,
  FaChevronLeft,
  FaChevronRight,
  FaCode,
  FaCog,
  FaCompress,
  FaCopy,
  FaEllipsisV,
  FaEraser,
  FaFile,
  FaFillDrip,
  FaFont,
  FaImage,
  FaIndent,
  FaItalic,
  FaLink,
  FaListOl,
  FaListUl,
  FaMinus,
  FaMobileAlt,
  FaOutdent,
  FaPaintBrush,
  FaParagraph,
  FaPlus,
  FaQuoteLeft,
  FaQuoteRight,
  FaRedo,
  FaSearch,
  FaSearchMinus,
  FaSlidersH,
  FaSmile,
  FaStrikethrough,
  FaSubscript,
  FaSuperscript,
  FaTable,
  FaTimes,
  FaTrash,
  FaUnderline,
  FaUndo,
  FaVideo,
} from 'react-icons/fa'

/** Toolbar / chrome glyph size (matches former FaBold toolbar icons). */
export const ICON_SIZE = 16

/** Compact badge (new-doc +, more-menu dots). */
export const ICON_SIZE_SM = 10

/** Menu-row / bubble secondary label icons. */
export const ICON_SIZE_MD = 14

type IconProps = {
  i: IconType
  /** Defaults to ICON_SIZE. */
  size?: number
  className?: string
  title?: string
}

/** Render any FA icon with project-default size / aria. */
export function Icon({ i: Comp, size = ICON_SIZE, className, title }: IconProps) {
  return (
    <Comp
      size={size}
      className={className}
      title={title}
      aria-hidden={title ? undefined : true}
    />
  )
}
