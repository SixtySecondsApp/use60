import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, 
  ChevronRight, 
  ChevronLeft,
  Building2,
  Target,
  MessageSquare,
  UserCheck,
  GitBranch,
  Database,
  ArrowRight,
  X,
  Moon,
  Sun,
  Clock,
  Plus,
  Pencil,
  Trash2,
  Sparkles,
  Globe,
  Mail,
  Settings,
  LayoutDashboard,
  FileText,
  Calendar
} from 'lucide-react';

const skills = [
  { id: 'lead_qualification', name: 'Qualification', icon: Target, description: 'Define how leads are scored and qualified' },
  { id: 'lead_enrichment', name: 'Enrichment', icon: Database, description: 'Customize discovery questions' },
  { id: 'brand_voice', name: 'Brand Voice', icon: MessageSquare, description: 'Set your communication style' },
  { id: 'objection_handling', name: 'Objections', icon: GitBranch, description: 'Define response playbooks' },
  { id: 'icp', name: 'ICP', icon: UserCheck, description: 'Describe your perfect customers' },
];

const enrichmentData = {
  name: 'Sixty Seconds',
  domain: 'sixtyseconds.co',
  industry: 'B2B SaaS / AI Automation',
  size: '10-50 employees',
  products: ['AI workflows', 'Video personalization', 'Sales automation'],
  targetMarket: 'B2B sales teams',
  competitors: ['Vidyard', 'Loom', 'Outreach'],
};

const initialSkillData = {
  lead_qualification: {
    criteria: [
      'Budget authority confirmed or path to budget identified',
      'Timeline for implementation under 90 days',
      'Technical requirements align with our platform capabilities',
      'Minimum team size of 5+ sales reps',
    ],
    disqualifiers: [
      'No executive sponsor identified',
      'Currently in contract with competitor (6+ months remaining)',
      'Company size under 20 employees',
    ],
  },
  lead_enrichment: {
    questions: [
      "What's their current sales tech stack and integration requirements?",
      "Who owns the budget for sales automation tools?",
      "What's driving their evaluation timing—any specific pain points?",
    ],
  },
  brand_voice: {
    tone: 'Professional but conversational. Tech-savvy without being jargony. Confident but not pushy.',
    avoid: ['Synergy', 'Leverage', 'Circle back', 'Low-hanging fruit', 'Move the needle'],
  },
  objection_handling: {
    objections: [
      { trigger: 'Too expensive', response: 'Focus on ROI and time saved. Reference case studies showing 3x return within 6 months.' },
      { trigger: 'We use Vidyard', response: 'Acknowledge their investment. Highlight AI-native automation and deeper CRM integration as differentiators.' },
      { trigger: 'Not the right time', response: 'Understand their timeline. Offer low-commitment pilot or educational content to stay top of mind.' },
    ],
  },
  icp: {
    companyProfile: 'B2B SaaS companies with 50-500 employees, Series A to C funded, with dedicated sales teams of 10+ reps.',
    buyerPersona: 'VP of Sales or Revenue Operations leader, 5+ years experience, measured on pipeline velocity and rep productivity.',
    buyingSignals: ['Hiring SDRs/AEs', 'Evaluating sales tools on G2', 'Outbound mentions of video prospecting'],
  },
};

function EditableItem({ value, onSave, onDelete, darkMode, icon: Icon, iconColor = 'text-gray-400' }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    onSave(editValue);
    setIsEditing(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className={`flex items-center gap-2 p-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <Icon className={`w-3.5 h-3.5 ${iconColor} flex-shrink-0`} />
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          autoFocus
          className={`flex-1 text-sm bg-transparent outline-none ${darkMode ? 'text-white' : 'text-gray-900'}`}
        />
        <button onClick={handleSave} className="text-green-500 hover:text-green-600">
          <Check className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-2 p-2 rounded-lg transition-colors ${darkMode ? 'bg-gray-800 hover:bg-gray-750' : 'bg-gray-50 hover:bg-gray-100'}`}>
      <Icon className={`w-3.5 h-3.5 ${iconColor} flex-shrink-0`} />
      <span className={`flex-1 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{value}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={() => setIsEditing(true)}
          className={`p-1 rounded ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
        >
          <Pencil className="w-3 h-3" />
        </button>
        <button 
          onClick={onDelete}
          className={`p-1 rounded ${darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function EditableTag({ value, onSave, onDelete, darkMode }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  const handleSave = () => {
    if (editValue.trim()) {
      onSave(editValue);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setIsEditing(false);
        }}
        autoFocus
        className={`px-2.5 py-1 text-sm rounded-full w-24 outline-none ring-2 ring-violet-500 ${
          darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
        }`}
      />
    );
  }

  return (
    <span 
      className={`group px-2.5 py-1 text-sm rounded-full flex items-center gap-1.5 cursor-pointer transition-colors ${
        darkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      <span onClick={() => setIsEditing(true)}>{value}</span>
      <button onClick={onDelete} className="opacity-0 group-hover:opacity-100 transition-opacity">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

function AddItemButton({ onAdd, placeholder, darkMode }) {
  const [isAdding, setIsAdding] = useState(false);
  const [value, setValue] = useState('');

  const handleAdd = () => {
    if (value.trim()) {
      onAdd(value);
      setValue('');
    }
    setIsAdding(false);
  };

  if (isAdding) {
    return (
      <div className={`flex items-center gap-2 p-2 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
        <Plus className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
            if (e.key === 'Escape') setIsAdding(false);
          }}
          placeholder={placeholder}
          autoFocus
          className={`flex-1 text-sm bg-transparent outline-none ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      className={`w-full flex items-center gap-2 p-2 rounded-lg border-2 border-dashed transition-colors ${
        darkMode 
          ? 'border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400' 
          : 'border-gray-200 text-gray-400 hover:border-violet-300 hover:text-violet-600'
      }`}
    >
      <Plus className="w-3.5 h-3.5" />
      <span className="text-sm">{placeholder}</span>
    </button>
  );
}

function SignupStep({ onContinue, darkMode }) {
  const [email, setEmail] = useState('andrew@sixtyseconds.co');
  const domain = email.match(/@([^@]+)$/)?.[1] || '';
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-md mx-auto px-4"
    >
      <div className={`rounded-2xl shadow-xl border p-6 sm:p-8 ${
        darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      }`}>
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/25">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Get started with use60
          </h1>
          <p className={`mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            Enter your work email to begin
          </p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Work email
            </label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full pl-10 pr-4 py-3.5 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  darkMode 
                    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500' 
                    : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
                } border`}
                placeholder="you@company.com"
              />
            </div>
          </div>

          {domain && (
            <div className={`flex items-center gap-2 p-3.5 rounded-xl border ${
              darkMode ? 'bg-blue-900/20 border-blue-800 text-blue-300' : 'bg-blue-50 border-blue-100 text-blue-700'
            }`}>
              <Globe className="w-4 h-4" />
              <span className="text-sm">
                We'll use <span className="font-semibold">{domain}</span> to customize your assistant
              </span>
            </div>
          )}
          
          <button
            onClick={onContinue}
            disabled={!email.includes('@')}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-xl font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25 disabled:shadow-none"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function EnrichmentLoadingStep({ onComplete, darkMode }) {
  const [progress, setProgress] = useState(0);
  
  const tasks = [
    { label: 'Scanning website', threshold: 20 },
    { label: 'Identifying industry', threshold: 40 },
    { label: 'Analyzing products', threshold: 60 },
    { label: 'Finding competitors', threshold: 80 },
    { label: 'Building profile', threshold: 100 },
  ];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return 100;
        }
        return prev + 3;
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [onComplete]);
  
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-md mx-auto px-4"
    >
      <div className={`rounded-2xl shadow-xl border p-8 sm:p-12 text-center ${
        darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      }`}>
        <div className="relative w-24 h-24 mx-auto mb-8">
          <svg className="w-24 h-24 transform -rotate-90">
            <circle 
              cx="48" cy="48" r="44" 
              stroke={darkMode ? '#374151' : '#e2e8f0'} 
              strokeWidth="6" 
              fill="none" 
            />
            <circle
              cx="48" cy="48" r="44" 
              stroke="url(#gradient)" 
              strokeWidth="6" 
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(progress / 100) * 276.46} 276.46`}
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="100%" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{progress}%</span>
          </div>
        </div>
        
        <h2 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Analyzing {enrichmentData.domain}
        </h2>
        <p className={`mb-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          Learning about your business to customize your assistant...
        </p>
        
        <div className="space-y-2.5 text-left">
          {tasks.map((task, i) => {
            const isDone = progress > task.threshold - 20;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 py-2 px-3 rounded-lg transition-all ${
                  isDone 
                    ? darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-700'
                    : darkMode ? 'text-gray-500' : 'text-gray-400'
                }`}
              >
                {isDone ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-current" />
                )}
                <span className="text-sm font-medium">{task.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function EnrichmentResultStep({ onContinue, darkMode }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-2xl mx-auto px-4"
    >
      <div className={`rounded-2xl shadow-xl border overflow-hidden ${
        darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
      }`}>
        <div className="bg-violet-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-white">We found Sixty Seconds</h2>
              <p className="text-violet-100 text-sm">Here's what we learned</p>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-3">
              <div>
                <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Company</p>
                <p className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{enrichmentData.name}</p>
              </div>
              <div>
                <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Industry</p>
                <p className={`font-medium text-sm ${darkMode ? 'text-white' : 'text-gray-900'}`}>{enrichmentData.industry}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Products</p>
                <div className="flex flex-wrap gap-1">
                  {enrichmentData.products.map((product, i) => (
                    <span key={i} className={`px-2 py-0.5 text-xs rounded-md ${
                      darkMode ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-50 text-violet-700'
                    }`}>{product}</span>
                  ))}
                </div>
              </div>
              <div>
                <p className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Competitors</p>
                <div className="flex flex-wrap gap-1">
                  {enrichmentData.competitors.map((comp, i) => (
                    <span key={i} className={`px-2 py-0.5 text-xs rounded-md ${
                      darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-600'
                    }`}>{comp}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <button
            onClick={onContinue}
            className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group"
          >
            Configure Skills
            <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function SkillConfigStep({ onComplete, darkMode, configuredSkills, setConfiguredSkills }) {
  const [currentSkillIndex, setCurrentSkillIndex] = useState(0);
  const [skippedSkills, setSkippedSkills] = useState([]);
  const [skillData, setSkillData] = useState(initialSkillData);
  
  const activeSkill = skills[currentSkillIndex];
  
  const updateSkillData = (skillId, field, value) => {
    setSkillData(prev => ({
      ...prev,
      [skillId]: {
        ...prev[skillId],
        [field]: value
      }
    }));
  };
  
  const handleSaveSkill = () => {
    if (!configuredSkills.includes(activeSkill.id)) {
      setConfiguredSkills([...configuredSkills, activeSkill.id]);
    }
    if (skippedSkills.includes(activeSkill.id)) {
      setSkippedSkills(skippedSkills.filter(s => s !== activeSkill.id));
    }
    moveNext();
  };
  
  const handleSkipSkill = () => {
    if (!skippedSkills.includes(activeSkill.id)) {
      setSkippedSkills([...skippedSkills, activeSkill.id]);
    }
    if (configuredSkills.includes(activeSkill.id)) {
      setConfiguredSkills(configuredSkills.filter(s => s !== activeSkill.id));
    }
    moveNext();
  };
  
  const moveNext = () => {
    if (currentSkillIndex < skills.length - 1) {
      setCurrentSkillIndex(currentSkillIndex + 1);
    } else {
      onComplete();
    }
  };
  
  const movePrev = () => {
    if (currentSkillIndex > 0) {
      setCurrentSkillIndex(currentSkillIndex - 1);
    }
  };
  
  const getSkillStatus = (skillId) => {
    if (configuredSkills.includes(skillId)) return 'configured';
    if (skippedSkills.includes(skillId)) return 'skipped';
    return 'pending';
  };
  
  const renderSkillConfig = () => {
    const data = skillData[activeSkill.id];
    
    switch (activeSkill.id) {
      case 'lead_qualification':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Qualification Criteria
                </label>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  darkMode ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-50 text-violet-600'
                }`}>Click to edit</span>
              </div>
              <div className="space-y-1.5">
                {data.criteria.map((item, i) => (
                  <EditableItem
                    key={i}
                    value={item}
                    onSave={(newValue) => {
                      const newCriteria = [...data.criteria];
                      newCriteria[i] = newValue;
                      updateSkillData('lead_qualification', 'criteria', newCriteria);
                    }}
                    onDelete={() => {
                      updateSkillData('lead_qualification', 'criteria', data.criteria.filter((_, idx) => idx !== i));
                    }}
                    darkMode={darkMode}
                    icon={Check}
                    iconColor="text-green-500"
                  />
                ))}
                <AddItemButton
                  onAdd={(value) => updateSkillData('lead_qualification', 'criteria', [...data.criteria, value])}
                  placeholder="Add qualification criterion"
                  darkMode={darkMode}
                />
              </div>
            </div>
            <div>
              <label className={`text-sm font-medium mb-2 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Disqualifiers
              </label>
              <div className="space-y-1.5">
                {data.disqualifiers.map((item, i) => (
                  <EditableItem
                    key={i}
                    value={item}
                    onSave={(newValue) => {
                      const newDisqualifiers = [...data.disqualifiers];
                      newDisqualifiers[i] = newValue;
                      updateSkillData('lead_qualification', 'disqualifiers', newDisqualifiers);
                    }}
                    onDelete={() => {
                      updateSkillData('lead_qualification', 'disqualifiers', data.disqualifiers.filter((_, idx) => idx !== i));
                    }}
                    darkMode={darkMode}
                    icon={X}
                    iconColor="text-red-500"
                  />
                ))}
                <AddItemButton
                  onAdd={(value) => updateSkillData('lead_qualification', 'disqualifiers', [...data.disqualifiers, value])}
                  placeholder="Add disqualifier"
                  darkMode={darkMode}
                />
              </div>
            </div>
          </div>
        );
        
      case 'brand_voice':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Tone Description
                </label>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  darkMode ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-50 text-violet-600'
                }`}>Suggested</span>
              </div>
              <textarea
                value={data.tone}
                onChange={(e) => updateSkillData('brand_voice', 'tone', e.target.value)}
                className={`w-full p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-20 text-sm ${
                  darkMode 
                    ? 'bg-gray-800 border-gray-700 text-white' 
                    : 'bg-white border-gray-200 text-gray-900'
                } border`}
              />
            </div>
            <div>
              <label className={`text-sm font-medium mb-2 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Words to Avoid
              </label>
              <div className="flex flex-wrap gap-1.5">
                {data.avoid.map((word, i) => (
                  <EditableTag
                    key={i}
                    value={word}
                    onSave={(newValue) => {
                      const newAvoid = [...data.avoid];
                      newAvoid[i] = newValue;
                      updateSkillData('brand_voice', 'avoid', newAvoid);
                    }}
                    onDelete={() => {
                      updateSkillData('brand_voice', 'avoid', data.avoid.filter((_, idx) => idx !== i));
                    }}
                    darkMode={darkMode}
                  />
                ))}
                <button
                  onClick={() => {
                    const word = prompt('Add word to avoid:');
                    if (word) updateSkillData('brand_voice', 'avoid', [...data.avoid, word]);
                  }}
                  className={`px-2.5 py-1 border border-dashed text-sm rounded-full transition-colors ${
                    darkMode 
                      ? 'border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400' 
                      : 'border-gray-300 text-gray-400 hover:border-violet-300 hover:text-violet-600'
                  }`}
                >
                  + Add
                </button>
              </div>
            </div>
          </div>
        );
        
      case 'lead_enrichment':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                Questions to ask during lead enrichment:
              </p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                darkMode ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-50 text-violet-600'
              }`}>Editable</span>
            </div>
            {data.questions.map((q, i) => (
              <div key={i} className="relative">
                <textarea
                  value={q}
                  onChange={(e) => {
                    const newQuestions = [...data.questions];
                    newQuestions[i] = e.target.value;
                    updateSkillData('lead_enrichment', 'questions', newQuestions);
                  }}
                  className={`w-full p-3 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-16 text-sm ${
                    darkMode 
                      ? 'bg-gray-800 border-gray-700 text-white' 
                      : 'bg-white border-gray-200 text-gray-900'
                  } border`}
                />
                <button
                  onClick={() => updateSkillData('lead_enrichment', 'questions', data.questions.filter((_, idx) => idx !== i))}
                  className={`absolute top-2 right-2 p-1 rounded ${
                    darkMode ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-100 text-gray-400'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => updateSkillData('lead_enrichment', 'questions', [...data.questions, ''])}
              className={`w-full p-3 border-2 border-dashed rounded-xl text-sm transition-colors flex items-center justify-center gap-2 ${
                darkMode 
                  ? 'border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400' 
                  : 'border-gray-200 text-gray-400 hover:border-violet-300 hover:text-violet-600'
              }`}
            >
              <Plus className="w-4 h-4" />
              Add question
            </button>
          </div>
        );
        
      case 'objection_handling':
        return (
          <div className="space-y-3">
            {data.objections.map((obj, i) => (
              <div key={i} className={`p-3 rounded-xl space-y-2 relative ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <button
                  onClick={() => updateSkillData('objection_handling', 'objections', data.objections.filter((_, idx) => idx !== i))}
                  className={`absolute top-2 right-2 p-1 rounded ${
                    darkMode ? 'hover:bg-gray-700 text-gray-500' : 'hover:bg-gray-200 text-gray-400'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                    darkMode ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-700'
                  }`}>Objection</span>
                  <input
                    value={obj.trigger}
                    onChange={(e) => {
                      const newObjections = [...data.objections];
                      newObjections[i] = { ...obj, trigger: e.target.value };
                      updateSkillData('objection_handling', 'objections', newObjections);
                    }}
                    className={`flex-1 text-sm font-medium bg-transparent outline-none ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}
                  />
                </div>
                <textarea
                  value={obj.response}
                  onChange={(e) => {
                    const newObjections = [...data.objections];
                    newObjections[i] = { ...obj, response: e.target.value };
                    updateSkillData('objection_handling', 'objections', newObjections);
                  }}
                  className={`w-full p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-14 text-sm ${
                    darkMode 
                      ? 'bg-gray-900 border-gray-700 text-white' 
                      : 'bg-white border-gray-200 text-gray-900'
                  } border`}
                />
              </div>
            ))}
            <button
              onClick={() => updateSkillData('objection_handling', 'objections', [...data.objections, { trigger: 'New objection', response: '' }])}
              className={`w-full p-3 border-2 border-dashed rounded-xl text-sm transition-colors flex items-center justify-center gap-2 ${
                darkMode 
                  ? 'border-gray-700 text-gray-500 hover:border-violet-500 hover:text-violet-400' 
                  : 'border-gray-200 text-gray-400 hover:border-violet-300 hover:text-violet-600'
              }`}
            >
              <Plus className="w-4 h-4" />
              Add objection response
            </button>
          </div>
        );
        
      case 'icp':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Ideal Company Profile
                </label>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  darkMode ? 'bg-violet-900/50 text-violet-300' : 'bg-violet-50 text-violet-600'
                }`}>Suggested</span>
              </div>
              <textarea
                value={data.companyProfile}
                onChange={(e) => updateSkillData('icp', 'companyProfile', e.target.value)}
                className={`w-full p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none h-20 text-sm ${
                  darkMode 
                    ? 'bg-gray-800 border-gray-700 text-white' 
                    : 'bg-white border-gray-200 text-gray-900'
                } border`}
              />
            </div>
            <div>
              <label className={`text-sm font-medium mb-2 block ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Buying Signals
              </label>
              <div className="space-y-1.5">
                {data.buyingSignals.map((signal, i) => (
                  <EditableItem
                    key={i}
                    value={signal}
                    onSave={(newValue) => {
                      const newSignals = [...data.buyingSignals];
                      newSignals[i] = newValue;
                      updateSkillData('icp', 'buyingSignals', newSignals);
                    }}
                    onDelete={() => {
                      updateSkillData('icp', 'buyingSignals', data.buyingSignals.filter((_, idx) => idx !== i));
                    }}
                    darkMode={darkMode}
                    icon={Target}
                    iconColor="text-green-500"
                  />
                ))}
                <AddItemButton
                  onAdd={(value) => updateSkillData('icp', 'buyingSignals', [...data.buyingSignals, value])}
                  placeholder="Add buying signal"
                  darkMode={darkMode}
                />
              </div>
            </div>
          </div>
        );
        
      default:
        return null;
    }
  };
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="w-full max-w-2xl mx-auto px-4"
    >
      <div className={`rounded-2xl shadow-xl border overflow-hidden ${
        darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100'
      }`}>
        {/* Tab Navigation */}
        <div className={`px-4 pt-4 border-b ${darkMode ? 'border-gray-800' : 'border-gray-100'}`}>
          <div className="flex gap-1 overflow-x-auto pb-0 scrollbar-hide">
            {skills.map((skill, index) => {
              const Icon = skill.icon;
              const status = getSkillStatus(skill.id);
              const isActive = index === currentSkillIndex;
              
              return (
                <button
                  key={skill.id}
                  onClick={() => setCurrentSkillIndex(index)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-all border-b-2 -mb-px ${
                    isActive
                      ? darkMode 
                        ? 'bg-gray-800 text-white border-violet-500' 
                        : 'bg-violet-50 text-violet-700 border-violet-500'
                      : status === 'configured'
                        ? darkMode
                          ? 'text-green-400 border-transparent hover:bg-gray-800'
                          : 'text-green-600 border-transparent hover:bg-gray-50'
                        : status === 'skipped'
                          ? darkMode
                            ? 'text-gray-500 border-transparent hover:bg-gray-800'
                            : 'text-gray-400 border-transparent hover:bg-gray-50'
                          : darkMode
                            ? 'text-gray-400 border-transparent hover:bg-gray-800'
                            : 'text-gray-500 border-transparent hover:bg-gray-50'
                  }`}
                >
                  {status === 'configured' && !isActive ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : status === 'skipped' && !isActive ? (
                    <Clock className="w-3.5 h-3.5" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">{skill.name}</span>
                </button>
              );
            })}
          </div>
        </div>
        
        {/* Content */}
        <div className="p-4 sm:p-6">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  {activeSkill.name}
                </h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {activeSkill.description}
                </p>
              </div>
              <span className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                {currentSkillIndex + 1} of {skills.length}
              </span>
            </div>
          </div>
          
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSkill.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="max-h-80 overflow-y-auto pr-1"
            >
              {renderSkillConfig()}
            </motion.div>
          </AnimatePresence>
        </div>
        
        {/* Footer */}
        <div className={`px-4 sm:px-6 py-4 border-t flex items-center justify-between gap-3 ${
          darkMode ? 'border-gray-800 bg-gray-900/50' : 'border-gray-100 bg-gray-50/50'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={movePrev}
              disabled={currentSkillIndex === 0}
              className={`p-2 rounded-lg transition-colors disabled:opacity-30 ${
                darkMode ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-200 text-gray-500'
              }`}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleSkipSkill}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                darkMode 
                  ? 'text-gray-400 hover:bg-gray-800 hover:text-gray-300' 
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Skip for now</span>
            </button>
          </div>
          
          <button
            onClick={handleSaveSkill}
            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-all"
          >
            {currentSkillIndex === skills.length - 1 ? 'Finish' : 'Save & Next'}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function CompletionStep({ onRestart, darkMode, configuredSkills }) {
  const nextSteps = [
    { icon: FileText, text: 'Connect your CRM to sync contacts' },
    { icon: Mail, text: 'Import your email templates' },
    { icon: Calendar, text: 'Set up your meeting calendar' }
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="w-full max-w-lg mx-auto px-4"
    >
      <div className={`rounded-2xl shadow-xl border p-8 sm:p-10 text-center ${
        darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      }`}>
        <motion.div 
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.2 }}
          className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/25"
        >
          <Check className="w-10 h-10 text-white" strokeWidth={3} />
        </motion.div>
        
        <h2 className={`text-2xl font-bold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Your Sales Assistant is Ready
        </h2>
        <p className={`mb-8 leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          We've trained your AI on <span className="font-semibold">{enrichmentData.name}</span>'s way of selling. 
          It now knows your qualification criteria, objection handling, and brand voice.
        </p>
        
        {/* Skills Summary */}
        <div className={`rounded-xl p-5 mb-8 ${darkMode ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <p className={`text-sm font-semibold mb-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Skills Configured</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {skills.map((skill) => {
              const Icon = skill.icon;
              const isConfigured = configuredSkills.includes(skill.id);
              return (
                <div
                  key={skill.id}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold ${
                    isConfigured
                      ? darkMode ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700'
                      : darkMode ? 'bg-gray-700 text-gray-500' : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {skill.name}
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={onRestart}
            className={`flex-1 rounded-xl px-4 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 ${
              darkMode 
                ? 'bg-gray-800 hover:bg-gray-700 text-white' 
                : 'bg-gray-100 hover:bg-gray-200 text-gray-900'
            }`}
          >
            <Settings className="w-4 h-4" />
            Edit Settings
          </button>
          <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-4 py-3.5 font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/25">
            <LayoutDashboard className="w-4 h-4" />
            Go to Dashboard
          </button>
        </div>
      </div>

      {/* What's Next */}
      <div className={`mt-6 rounded-2xl border p-6 text-left shadow-xl ${
        darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'
      }`}>
        <h3 className={`font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>What's next?</h3>
        <div className="space-y-3">
          {nextSteps.map((item, i) => {
            const Icon = item.icon;
            return (
              <div 
                key={i} 
                className={`flex items-center gap-3 p-2 rounded-lg transition-colors cursor-pointer ${
                  darkMode ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  darkMode ? 'bg-gray-800' : 'bg-gray-100'
                }`}>
                  <Icon className={`w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                </div>
                <span className="text-sm font-medium">{item.text}</span>
                <ChevronRight className={`w-4 h-4 ml-auto ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

export default function SkillsOnboardingFlow() {
  const [step, setStep] = useState(0);
  const [darkMode, setDarkMode] = useState(false);
  const [configuredSkills, setConfiguredSkills] = useState([]);
  
  return (
    <div className={`min-h-screen flex items-center justify-center p-4 sm:p-8 transition-colors duration-300 ${
      darkMode ? 'bg-gray-950' : 'bg-gradient-to-b from-slate-50 to-white'
    }`}>
      <button
        onClick={() => setDarkMode(!darkMode)}
        className={`fixed top-4 right-4 sm:top-8 sm:right-8 p-3 rounded-xl transition-all z-50 ${
          darkMode 
            ? 'bg-gray-800 text-yellow-400 hover:bg-gray-700' 
            : 'bg-white text-gray-600 hover:bg-gray-50 shadow-lg'
        }`}
      >
        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      
      <AnimatePresence mode="wait">
        {step === 0 && (
          <SignupStep key="signup" onContinue={() => setStep(1)} darkMode={darkMode} />
        )}
        {step === 1 && (
          <EnrichmentLoadingStep key="loading" onComplete={() => setStep(2)} darkMode={darkMode} />
        )}
        {step === 2 && (
          <EnrichmentResultStep key="result" onContinue={() => setStep(3)} darkMode={darkMode} />
        )}
        {step === 3 && (
          <SkillConfigStep 
            key="config" 
            onComplete={() => setStep(4)} 
            darkMode={darkMode} 
            configuredSkills={configuredSkills}
            setConfiguredSkills={setConfiguredSkills}
          />
        )}
        {step === 4 && (
          <CompletionStep 
            key="complete" 
            onRestart={() => setStep(3)} 
            darkMode={darkMode} 
            configuredSkills={configuredSkills}
          />
        )}
      </AnimatePresence>
    </div>
  );
}