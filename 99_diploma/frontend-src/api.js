const PREFIX = '/api';

const req = (url, options = {}) => {
  const { body } = options;

  return fetch((PREFIX + url).replace(/\/\/$/, ""), {
    ...options,
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : null,
    headers: {
      ...options.headers,
      ...(body
        ? {
          "Content-Type": "application/json",
        }
        : null),
    },
  }).then((res) =>
    res.ok
      ? res.json()
      : res.text().then((message) => {
        throw new Error(message || 'Ошибка сети');
      })
  );
};

export const getNotes = ({ age = '1week', search = '', page = 1 } = {}) => {
  const qs = new URLSearchParams({ age, search, page });
  return req(`/notes?${qs.toString()}`);
};

export const createNote = (title, text) => {
  return req('/notes', { method: 'POST', body: { title, text } });
};

export const getNote = (id) => {
  return req(`/notes/${id}`);
};

export const archiveNote = (id) => {
  return req(`/notes/${id}/archive`, { method: 'POST' });
};

export const unarchiveNote = (id) => {
  return req(`/notes/${id}/unarchive`, { method: 'POST' });
};

export const editNote = (id, title, text) => {
  return req(`/notes/${id}`, { method: 'PUT', body: { title, text } });
};

export const deleteNote = (id) => {
  return fetch(`/api/notes/${id}`, { method: 'DELETE', credentials: 'same-origin' })
    .then((result) => {
      if (!result.ok) return result.text().then((respText) => { throw new Error(respText) });
      return result.json();
    });
};

export const deleteAllArchived = () => {
  return fetch(`/api/notes`, { method: 'DELETE', credentials: 'same-origin' })
    .then((result) => {
      if (!result.ok) return result.text().then((respText) => { throw new Error(respText) });
      return result.json();
    });
};

export const notePdfUrl = (id) => {
  return `/api/notes/${id}/pdf`;
};
