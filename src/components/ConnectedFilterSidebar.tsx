import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Filter,
  ChevronRight,
  Building,
  Building2,
  MapPin,
  Heart,
  List,
  X
} from 'lucide-react';

interface FilterOption {
  label: string;
  count: number;
}

interface ConnectedFilterSidebarProps {
  activeTab: string;
  isOpen: boolean;
  onClose: () => void;
  skipInitialAnimation?: boolean;
  
  // Company filters
  sizeFilter: string[];
  setSizeFilter: (sizes: string[]) => void;
  industryFilter: string[];
  setIndustryFilter: (industries: string[]) => void;
  locationFilter: string[];
  setLocationFilter: (locations: string[]) => void;
  
  // Deal filters
  dealStageFilter: string[];
  setDealStageFilter: (stages: string[]) => void;
  
  // Filter options with counts
  sizeOptions: FilterOption[];
  industryOptions: FilterOption[];
  locationOptions: FilterOption[];
  dealStageOptions?: FilterOption[];
}

// Multi-select dropdown component
const MultiSelect = ({ options, placeholder, selected = [], onChange }: {
  options: FilterOption[];
  placeholder: string;
  selected: string[];
  onChange: (values: string[]) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
        width: rect.width
      });
    }
  }, [isOpen]);

  const toggleOption = (option: FilterOption) => {
    const newSelected = selected.includes(option.label)
      ? selected.filter(item => item !== option.label)
      : [...selected, option.label];
    onChange(newSelected);
  };

  const selectedCount = selected.length;

  return (
    <div ref={dropdownRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-left flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-600 transition-colors duration-200"
      >
        <span className="text-sm text-gray-900 dark:text-gray-300">
          {selectedCount === 0
            ? placeholder
            : selectedCount === 1
            ? selected[0]
            : `${selectedCount} selected`}
        </span>
        <div className="flex items-center gap-2">
          {selectedCount > 0 && (
            <span className="text-xs bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
              {selectedCount}
            </span>
          )}
          <ChevronRight className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            style={{ 
              position: 'fixed', 
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              zIndex: 99999 
            }}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden"
          >
            <div className="max-h-64 overflow-y-auto">
              {options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleOption(option)}
                  className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-150"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded border-2 transition-all duration-200 ${
                      selected.includes(option.label)
                        ? 'bg-emerald-600 dark:bg-emerald-500 border-emerald-600 dark:border-emerald-500'
                        : 'border-gray-300 dark:border-gray-600 bg-transparent'
                    }`}>
                      {selected.includes(option.label) && (
                        <svg className="w-full h-full text-white" viewBox="0 0 16 16">
                          <path
                            fill="currentColor"
                            d="M13.5 3.5L6 11l-3.5-3.5L1 9l5 5L15 5z"
                          />
                        </svg>
                      )}
                    </div>
                    <span className={`text-sm ${
                      selected.includes(option.label) ? 'text-gray-900 dark:text-white font-medium' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {option.label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-600 dark:text-gray-500">{option.count}</span>
                </button>
              ))}
            </div>
            {options.length > 5 && (
              <div className="p-2 border-t border-gray-700 bg-gray-850">
                <div className="flex items-center justify-between text-xs">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(options.map(o => o.label));
                    }}
                    className="text-emerald-400 hover:text-emerald-300 transition-colors"
                  >
                    Select all
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange([]);
                    }}
                    className="text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    Clear all
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const FilterSection = ({ title, icon: Icon, expanded, children }: {
  title: string;
  icon: React.ElementType;
  expanded: boolean;
  children: React.ReactNode;
}) => {
  const [isExpanded, setIsExpanded] = useState(expanded);
  
  return (
    <div className="border-b border-gray-200 dark:border-gray-800/50 last:border-0">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full py-4 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors duration-200"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-4 h-4 text-gray-700 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-300">{title}</span>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-500 rotate-90" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pb-4 px-1">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export function ConnectedFilterSidebar({
  activeTab,
  isOpen,
  onClose,
  skipInitialAnimation = false,
  sizeFilter,
  setSizeFilter,
  industryFilter,
  setIndustryFilter,
  locationFilter,
  setLocationFilter,
  dealStageFilter,
  setDealStageFilter,
  sizeOptions,
  industryOptions,
  locationOptions,
  dealStageOptions = []
}: ConnectedFilterSidebarProps) {
  const [hasAnimated, setHasAnimated] = useState(false);
  const isFirstRender = useRef(true);
  
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setHasAnimated(true);
  }, [isOpen]);

  const clearAllFilters = () => {
    setSizeFilter([]);
    setIndustryFilter([]);
    setLocationFilter([]);
    setDealStageFilter([]);
  };

  const getTotalFilterCount = () => {
    return sizeFilter.length + industryFilter.length + locationFilter.length + dealStageFilter.length;
  };

  // Get relevant filters based on active tab
  const getRelevantFilters = () => {
    const baseFilters = [
      {
        key: 'companySize',
        title: 'Company Size',
        icon: Building,
        options: sizeOptions,
        selected: sizeFilter,
        onChange: setSizeFilter,
        expanded: true
      },
      {
        key: 'industry',
        title: 'Industry',
        icon: Building2,
        options: industryOptions,
        selected: industryFilter,
        onChange: setIndustryFilter,
        expanded: true
      },
      {
        key: 'location',
        title: 'Location',
        icon: MapPin,
        options: locationOptions,
        selected: locationFilter,
        onChange: setLocationFilter,
        expanded: true
      }
    ];

    if (activeTab === 'deals') {
      baseFilters.push({
        key: 'dealStage',
        title: 'Deal Stage',
        icon: Heart,
        options: dealStageOptions,
        selected: dealStageFilter,
        onChange: setDealStageFilter,
        expanded: true
      });
    }

    return baseFilters;
  };

  const shouldAnimate = !isFirstRender.current && !skipInitialAnimation;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={shouldAnimate ? { x: 256 } : { x: 0 }}
          animate={{ x: 0 }}
          exit={{ x: 256 }}
          transition={shouldAnimate ? { type: "spring", damping: 25, stiffness: 200 } : { duration: 0 }}
          className="fixed right-0 top-0 h-full w-[256px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 z-[150] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filters</h3>
                {getTotalFilterCount() > 0 && (
                  <span className="text-xs bg-emerald-50 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                    {getTotalFilterCount()}
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">Refine your {activeTab} results</p>
          </div>

          {/* Filter sections */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6">
              {getRelevantFilters().map((filter) => (
                <FilterSection
                  key={filter.key}
                  title={filter.title}
                  icon={filter.icon}
                  expanded={filter.expanded}
                >
                  <MultiSelect
                    options={filter.options}
                    placeholder={`Select ${filter.title.toLowerCase()}`}
                    selected={filter.selected}
                    onChange={filter.onChange}
                  />
                </FilterSection>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
            <div className="flex items-center gap-3">
              <button
                onClick={clearAllFilters}
                className="flex-1 py-2 px-4 text-sm text-gray-700 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-all duration-200"
              >
                Clear all
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 px-4 text-sm bg-emerald-600 dark:bg-emerald-500 hover:bg-emerald-700 dark:hover:bg-emerald-600 text-white rounded-lg transition-all duration-200 font-medium"
              >
                Apply filters
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ConnectedFilterSidebar;