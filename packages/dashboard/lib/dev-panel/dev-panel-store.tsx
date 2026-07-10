'use client';

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';

// Types for Dev Panel entries
export interface DevPanelRequest {
  id: number;
  timestamp: Date;
  method: string;
  url: string;
  requestBody?: string;
  responseBody?: string;
  statusCode?: number;
  statusText?: string;
  durationMs: number;
  error?: string;
  source: 'client' | 'server' | 'frontend';
}

export interface DevPanelError {
  id: number;
  timestamp: Date;
  source: 'Content Provider' | 'chad-dba' | 'Next.js' | 'UI';
  message: string;
  stackTrace?: string;
  requestId?: number;
  context?: string;
  rawError?: string;
}

export type DevPanelTab = 'requests' | 'errors';

interface DevPanelStoreContextType {
  // Requests
  requests: DevPanelRequest[];
  addRequest: (request: Omit<DevPanelRequest, 'id' | 'timestamp'>) => void;
  clearRequests: () => void;
  
  // Errors
  errors: DevPanelError[];
  addError: (error: Omit<DevPanelError, 'id' | 'timestamp'>) => void;
  clearErrors: () => void;
  
  // UI State
  isExpanded: boolean;
  activeTab: DevPanelTab;
  togglePanel: () => void;
  setTab: (tab: DevPanelTab) => void;
  
  // Counts
  requestCount: number;
  errorCount: number;
}

const DevPanelStoreContext = createContext<DevPanelStoreContextType | undefined>(undefined);

const MAX_REQUESTS = 100;
const MAX_ERRORS = 200;

export function DevPanelStoreProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<DevPanelRequest[]>([]);
  const [errors, setErrors] = useState<DevPanelError[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<DevPanelTab>('requests');
  const nextRequestId = useRef(1);
  const nextErrorId = useRef(1);

  const addRequest = useCallback((request: Omit<DevPanelRequest, 'id' | 'timestamp'>) => {
    const newRequest: DevPanelRequest = {
      ...request,
      id: nextRequestId.current,
      timestamp: new Date(),
    };

    nextRequestId.current += 1;
    setRequests(prev => {
      const updated = [newRequest, ...prev];
      return updated.slice(0, MAX_REQUESTS);
    });
  }, []);

  const addError = useCallback((error: Omit<DevPanelError, 'id' | 'timestamp'>) => {
    const newError: DevPanelError = {
      ...error,
      id: nextErrorId.current,
      timestamp: new Date(),
    };

    nextErrorId.current += 1;
    setErrors(prev => {
      const updated = [newError, ...prev];
      return updated.slice(0, MAX_ERRORS);
    });
  }, []);

  const clearRequests = useCallback(() => {
    setRequests([]);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const togglePanel = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const setTab = useCallback((tab: DevPanelTab) => {
    setActiveTab(tab);
  }, []);

  return (
    <DevPanelStoreContext.Provider
      value={{
        requests,
        addRequest,
        clearRequests,
        errors,
        addError,
        clearErrors,
        isExpanded,
        activeTab,
        togglePanel,
        setTab,
        requestCount: requests.length,
        errorCount: errors.length,
      }}
    >
      {children}
    </DevPanelStoreContext.Provider>
  );
}

export function useDevPanelStore() {
  const context = useContext(DevPanelStoreContext);
  if (context === undefined) {
    throw new Error('useDevPanelStore must be used within a DevPanelStoreProvider');
  }
  return context;
}