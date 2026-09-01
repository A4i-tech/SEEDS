import { SEEDS_URL } from "../Constants";
import { getAuthHeaders } from "../utils/authHelpers";
import { apiFetch, buildQueryString } from "./api";

const normalizeId = (item) => {
  if (item && !item.id && item._id) {
    return { ...item, id: item._id };
  }
  return item;
};

const formatCreated = (createdAt) => {
  if (!createdAt) return "";
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
};

const normalizeProject = (project) => {
  const withId = normalizeId(project);
  if (!withId) return withId;
  return { ...withId, created: formatCreated(withId.createdAt) };
};

const normalizeSite = (site) => {
  const withId = normalizeId(site);
  if (!withId) return withId;
  return {
    ...withId,
    url: withId.domain ? `https://${withId.domain}` : "",
    created: formatCreated(withId.createdAt),
  };
};

export const onboardingService = {
  /**
   * Create a new localization project
   * @param {Object} params - { name, description, sourceLanguage, status }
   * @returns {Promise<Object>}
   */
  async createProject({ name, description, sourceLanguage, status }) {
    const url = `${SEEDS_URL}/projects`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, description, sourceLanguage, status }),
    });

    return normalizeProject(response);
  },

  /**
   * List all localization projects
   * @returns {Promise<Array>}
   */
  async listProjects() {
    const url = `${SEEDS_URL}/projects`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return (response || []).map(normalizeProject);
  },

  /**
   * Update a localization project
   * @param {string} id
   * @param {Object} fields - { name, description, sourceLanguage, status }
   * @returns {Promise<Object>}
   */
  async updateProject(id, fields) {
    const url = `${SEEDS_URL}/projects/${id}`;

    const response = await apiFetch(url, {
      method: "PUT",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fields),
    });

    return normalizeProject(response);
  },

  /**
   * Delete a localization project
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteProject(id) {
    const url = `${SEEDS_URL}/projects/${id}`;

    return apiFetch(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },

  /**
   * Register a website under a project, generating its real backend siteId
   * @param {Object} params - { projectId, domain, name, status }
   * @returns {Promise<Object>}
   */
  async createSite({ projectId, domain, name, status }) {
    const url = `${SEEDS_URL}/websites`;

    const response = await apiFetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId, domain, name, status }),
    });

    return normalizeSite(response);
  },

  /**
   * List registered websites, optionally filtered by project
   * @param {string} [projectId]
   * @returns {Promise<Array>}
   */
  async listSites(projectId) {
    const queryString = projectId ? `?${buildQueryString({ projectId })}` : "";
    const url = `${SEEDS_URL}/websites${queryString}`;

    const response = await apiFetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    return (response || []).map(normalizeSite);
  },

  /**
   * Update a registered website
   * @param {string} id
   * @param {Object} fields - { name, domain, status }
   * @returns {Promise<Object>}
   */
  async updateSite(id, fields) {
    const url = `${SEEDS_URL}/websites/${id}`;

    const response = await apiFetch(url, {
      method: "PUT",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fields),
    });

    return normalizeSite(response);
  },

  /**
   * Delete a registered website
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteSite(id) {
    const url = `${SEEDS_URL}/websites/${id}`;

    return apiFetch(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
  },
};
