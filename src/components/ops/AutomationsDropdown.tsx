import { Zap, GitBranch, BookOpen, ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

interface AutomationsDropdownProps {
  onOpenWorkflows: () => void;
  onOpenRecipes: () => void;
}

export function AutomationsDropdown({ onOpenWorkflows, onOpenRecipes }: AutomationsDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white">
          <Zap className="h-3.5 w-3.5" />
          Automations
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onOpenWorkflows}>
          <GitBranch className="mr-2 h-4 w-4 text-violet-400" />
          <span>Workflows</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenRecipes}>
          <BookOpen className="mr-2 h-4 w-4 text-amber-400" />
          <span>Recipes</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
