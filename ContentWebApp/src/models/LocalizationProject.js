export const createLocalizationProject = ({
    name,
    description,
    sourceLanguage,
    status,
  }) => ({
  
    id: Date.now(),
  
    name,
  
    description,
  
    sourceLanguage,
  
    status,
  
    created: new Date().toLocaleDateString(),
  
    updated: new Date().toLocaleDateString(),
  
    createdBy: "Admin",
  
    sites: [],
  
    translationMemory: 0,
  
    totalTranslations: 0,
  
    translationSession: {
  
      website: "",
  
      originalHtml: "",
  
      originalText: "",
  
      aiTranslation: "",
  
      reviewerTranslation: "",
  
      reviewerComments: "",
  
      updatedTranslation: "",
  
      reviewStage: "Draft",
  
      reviewEvents: [],
  
      translationVersions: [],
  
      confidence: 0,
  
      analytics: {},
  
    },
  
  });