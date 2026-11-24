import {
  BarChart3,
  BookMarked,
  BookOpen,
  Box,
  Briefcase,
  Calculator,
  Clapperboard,
  ClipboardList,
  Cloud,
  Code2,
  Compass,
  Contact,
  CreditCard,
  Database,
  Feather,
  FileText,
  FileUp,
  Film,
  Gamepad2,
  GitBranch,
  Globe,
  GraduationCap,
  Headphones,
  HeartHandshake,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Library,
  Link2,
  Mail,
  Megaphone,
  MessageSquare,
  MessagesSquare,
  Music,
  Newspaper,
  NotebookPen,
  Palette,
  PenLine,
  PenTool,
  Presentation,
  Search,
  Server,
  ShieldAlert,
  Smile,
  Sparkles,
  Store,
  Table2,
  TrendingUp,
  UserCircle2,
  Users,
  Webhook,
  Wrench,
} from 'lucide-react';
import type { ServiceIconName } from '../data/services';

interface ServiceIconProps {
  name: ServiceIconName;
  className?: string;
}

export function ServiceIcon({ name, className = 'w-5 h-5' }: ServiceIconProps) {
  switch (name) {
    case 'search':
      return <Search className={className} />;
    case 'layout-grid':
      return <LayoutGrid className={className} />;
    case 'globe':
      return <Globe className={className} />;
    case 'pen-line':
      return <PenLine className={className} />;
    case 'file-up':
      return <FileUp className={className} />;
    case 'store':
      return <Store className={className} />;
    case 'gamepad-2':
      return <Gamepad2 className={className} />;
    case 'code-2':
      return <Code2 className={className} />;
    case 'cloud':
      return <Cloud className={className} />;
    case 'webhook':
      return <Webhook className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'mail':
      return <Mail className={className} />;
    case 'film':
      return <Film className={className} />;
    case 'music':
      return <Music className={className} />;
    case 'image':
      return <ImageIcon className={className} />;
    case 'credit-card':
      return <CreditCard className={className} />;
    case 'graduation-cap':
      return <GraduationCap className={className} />;
    case 'database':
      return <Database className={className} />;
    case 'feather':
      return <Feather className={className} />;
    case 'smile':
      return <Smile className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'heart-handshake':
      return <HeartHandshake className={className} />;
    case 'briefcase':
      return <Briefcase className={className} />;
    case 'box':
      return <Box className={className} />;
    case 'palette':
      return <Palette className={className} />;
    case 'clapperboard':
      return <Clapperboard className={className} />;
    case 'pen-tool':
      return <PenTool className={className} />;
    case 'clipboard-list':
      return <ClipboardList className={className} />;
    case 'file-text':
      return <FileText className={className} />;
    case 'presentation':
      return <Presentation className={className} />;
    case 'table-2':
      return <Table2 className={className} />;
    case 'calculator':
      return <Calculator className={className} />;
    case 'trending-up':
      return <TrendingUp className={className} />;
    case 'bar-chart-3':
      return <BarChart3 className={className} />;
    case 'notebook-pen':
      return <NotebookPen className={className} />;
    case 'newspaper':
      return <Newspaper className={className} />;
    case 'git-branch':
      return <GitBranch className={className} />;
    case 'message-square':
      return <MessageSquare className={className} />;
    case 'users':
      return <Users className={className} />;
    case 'contact':
      return <Contact className={className} />;
    case 'book-open':
      return <BookOpen className={className} />;
    case 'library':
      return <Library className={className} />;
    case 'book-marked':
      return <BookMarked className={className} />;
    case 'layers':
      return <Layers className={className} />;
    case 'link-2':
      return <Link2 className={className} />;
    case 'user-circle':
      return <UserCircle2 className={className} />;
    case 'wrench':
      return <Wrench className={className} />;
    case 'megaphone':
      return <Megaphone className={className} />;
    case 'server':
      return <Server className={className} />;
    case 'headphones':
      return <Headphones className={className} />;
    case 'messages-square':
      return <MessagesSquare className={className} />;
    case 'shield-alert':
      return <ShieldAlert className={className} />;
  }
}
