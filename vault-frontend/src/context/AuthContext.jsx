import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);
const USERS_KEY = 'vault_users';

function readUsers() {
  try {
    const saved = localStorage.getItem(USERS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (e) {
    return [];
  }
}

function createUserRecord(name, email, role) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const existing = readUsers().find((entry) => entry.email === cleanEmail);
  if (existing) {
    return existing;
  }

  const userObj = {
    id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name || 'Valued User',
    email: cleanEmail,
    role,
    token: `jwt_mock_token_${Date.now()}`,
  };

  const users = readUsers();
  users.push(userObj);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
  return userObj;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('vault_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  const login = (email, password) => {
    const cleanEmail = (email || '').trim().toLowerCase();

    let role = 'user';
    let name = cleanEmail.split('@')[0];
    name = name.charAt(0).toUpperCase() + name.slice(1);

    if (cleanEmail === 'admin@vault.io' && (password === 'admin' || password === 'admin123')) {
      role = 'admin';
      name = 'Cluster Administrator';
    } else if (cleanEmail === 'admin@vault.io') {
      throw new Error('Invalid admin password. Default admin password is: admin');
    }

    const userObj = createUserRecord(name, cleanEmail, role);
    setUser(userObj);
    localStorage.setItem('vault_user', JSON.stringify(userObj));
    return userObj;
  };

  const register = (name, email, password) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    const userObj = createUserRecord(name, cleanEmail, 'user');
    setUser(userObj);
    localStorage.setItem('vault_user', JSON.stringify(userObj));
    return userObj;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('vault_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
