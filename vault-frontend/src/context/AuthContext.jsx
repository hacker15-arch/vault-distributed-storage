import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

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
    
    // Dedicated Single Admin Credentials Check
    let role = 'user';
    let name = cleanEmail.split('@')[0];
    name = name.charAt(0).toUpperCase() + name.slice(1);

    if (cleanEmail === 'admin@vault.io' && (password === 'admin' || password === 'admin123')) {
      role = 'admin';
      name = 'Cluster Administrator';
    } else if (cleanEmail === 'admin@vault.io') {
      throw new Error('Invalid admin password. Default admin password is: admin');
    }

    const userObj = {
      id: 'usr_' + Date.now(),
      name: name || 'Valued User',
      email: cleanEmail,
      role: role,
      token: 'jwt_mock_token_' + Date.now(),
    };

    setUser(userObj);
    localStorage.setItem('vault_user', JSON.stringify(userObj));
    return userObj;
  };

  const register = (name, email, password) => {
    const cleanEmail = (email || '').trim().toLowerCase();
    
    // Public registration ALWAYS creates a regular user
    const userObj = {
      id: 'usr_' + Date.now(),
      name: name || 'Valued User',
      email: cleanEmail,
      role: 'user',
      token: 'jwt_mock_token_' + Date.now(),
    };

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
