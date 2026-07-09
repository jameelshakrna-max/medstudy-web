const communityTemplates = [
  {
    id: 'study-group',
    name: 'Study Group',
    description: 'Collaborative study group with leaderboards and competitions',
    icon: 'graduation-cap',
    defaults: {
      name: '',
      description: '',
      type: 'public',
      rules: [
        'Be respectful to fellow members',
        'No spam or self-promotion',
        'Stay on topic — med study only',
        'Use descriptive titles when asking questions',
      ],
      settings: {
        allow_messaging: true,
        allow_file_sharing: true,
        allow_competitions: true,
        require_approval: false,
      },
    },
  },
  {
    id: 'qbank-club',
    name: 'QBank Club',
    description: 'Question bank discussion and strategy sharing',
    icon: 'file-text',
    defaults: {
      name: '',
      description: '',
      type: 'public',
      rules: [
        'No sharing copyrighted question banks',
        'Explain your reasoning when answering',
        'Use spoiler tags for answers',
        'Be constructive with corrections',
      ],
      settings: {
        allow_messaging: true,
        allow_file_sharing: true,
        allow_competitions: false,
        require_approval: false,
      },
    },
  },
  {
    id: 'anki-share',
    name: 'Anki Share',
    description: 'Share and review Anki decks together',
    icon: 'layers',
    defaults: {
      name: '',
      description: '',
      type: 'public',
      rules: [
        'Credit original deck authors',
        'No decks containing copyrighted material',
        'Tag decks appropriately',
        'Provide deck descriptions',
      ],
      settings: {
        allow_messaging: true,
        allow_file_sharing: true,
        allow_competitions: false,
        require_approval: false,
      },
    },
  },
  {
    id: 'study-buddy',
    name: 'Study Buddy',
    description: 'Small accountability groups for focused study sessions',
    icon: 'users',
    defaults: {
      name: '',
      description: '',
      type: 'private',
      rules: [
        'Daily check-ins required',
        'Share your goals at the start',
        'No distractions — study first',
        'Support your buddies',
      ],
      settings: {
        allow_messaging: true,
        allow_file_sharing: false,
        allow_competitions: false,
        require_approval: true,
      },
    },
  },
  {
    id: 'rotation-review',
    name: 'Rotation Review',
    description: 'Clinical rotation experiences and shelf exam prep',
    icon: 'stethoscope',
    defaults: {
      name: '',
      description: '',
      type: 'public',
      rules: [
        'No patient identifiers',
        'Share de-identified cases only',
        'Focus on learning points',
        'Include rotation type in posts',
      ],
      settings: {
        allow_messaging: true,
        allow_file_sharing: true,
        allow_competitions: false,
        require_approval: false,
      },
    },
  },
]

export default communityTemplates
