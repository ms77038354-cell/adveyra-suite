import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  Contact, Lead, Client, Task, Conversation, Message, Campaign, NotificationItem, Profile 
} from '../types';
import { 
  MOCK_PROFILE, INITIAL_CONTACTS, INITIAL_LEADS, INITIAL_CLIENTS, INITIAL_TASKS, 
  INITIAL_CONVERSATIONS, INITIAL_MESSAGES, INITIAL_CAMPAIGNS, INITIAL_NOTIFICATIONS 
} from '../services/mockData';
import { supabase, isSupabaseConfigured } from './supabaseClient';

interface AppContextType {
  profile: Profile;
  contacts: Contact[];
  leads: Lead[];
  clients: Client[];
  tasks: Task[];
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  activeConversationId: string | null;
  campaigns: Campaign[];
  notifications: NotificationItem[];
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isCloudConnected: boolean;
  
  // Actions
  addContact: (contact: Omit<Contact, 'id' | 'created_at'>) => Promise<void>;
  updateContact: (id: string, contact: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;

  addLead: (lead: Omit<Lead, 'id' | 'created_at'>) => Promise<void>;
  updateLeadStage: (id: string, stage: Lead['stage']) => Promise<void>;
  deleteLead: (id: string) => Promise<void>;

  addClient: (client: Omit<Client, 'id' | 'created_at'>) => Promise<void>;
  updateClient: (id: string, client: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;

  addTask: (task: Omit<Task, 'id'>) => Promise<void>;
  updateTaskStatus: (id: string, status: Task['status']) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;

  setActiveConversation: (id: string | null) => void;
  sendMessage: (conversationId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  clearConversation: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;

  addCampaign: (campaign: Omit<Campaign, 'id'>) => Promise<void>;
  markNotificationRead: (id: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [profile, setProfile] = useState<Profile>(MOCK_PROFILE);
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(isSupabaseConfigured);
  
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [clients, setClients] = useState<Client[]>(INITIAL_CLIENTS);
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [messages, setMessages] = useState<Record<string, Message[]>>(INITIAL_MESSAGES);
  const [activeConversationId, setActiveConversationId] = useState<string | null>('conv_1');
  const [campaigns, setCampaigns] = useState<Campaign[]>(INITIAL_CAMPAIGNS);
  const [notifications, setNotifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);

  // Check Supabase session & fetch real data if configured
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Fetch profile
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (prof) {
          setProfile({
            id: prof.id,
            full_name: prof.full_name,
            email: prof.email,
            role: prof.role,
            avatar: prof.avatar_url || MOCK_PROFILE.avatar
          });
          setIsCloudConnected(true);
          fetchAllCloudData(prof.organization_id);
        }
      }
    };

    checkSession();

    // Setup Realtime subscription for messages if connected
    const messageChannel = supabase
      .channel('public:messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const newMsg = payload.new as Message;
        setMessages(prev => ({
          ...prev,
          [newMsg.conversation_id]: [...(prev[newMsg.conversation_id] || []), newMsg]
        }));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageChannel);
    };
  }, []);

  const fetchAllCloudData = async (orgId: string) => {
    try {
      const [cntRes, ledRes, cltRes, tskRes, convRes, cmpRes] = await Promise.all([
        supabase.from('contacts').select('*').eq('organization_id', orgId),
        supabase.from('leads').select('*').eq('organization_id', orgId),
        supabase.from('clients').select('*').eq('organization_id', orgId),
        supabase.from('tasks').select('*').eq('organization_id', orgId),
        supabase.from('conversations').select('*').eq('organization_id', orgId),
        supabase.from('campaigns').select('*').eq('organization_id', orgId)
      ]);

      if (cntRes.data) setContacts(cntRes.data);
      if (ledRes.data) setLeads(ledRes.data);
      if (cltRes.data) setClients(cltRes.data);
      if (tskRes.data) setTasks(tskRes.data);
      if (convRes.data) setConversations(convRes.data);
      if (cmpRes.data) setCampaigns(cmpRes.data);
    } catch (err) {
      console.error('Error syncing cloud data:', err);
    }
  };

  // Contact actions
  const addContact = async (data: Omit<Contact, 'id' | 'created_at'>) => {
    const newContact: Contact = {
      ...data,
      id: `cnt_${Date.now()}`,
      created_at: new Date().toISOString().split('T')[0]
    };
    setContacts([newContact, ...contacts]);

    if (isCloudConnected) {
      await supabase.from('contacts').insert([newContact]);
    }
  };

  const updateContact = async (id: string, data: Partial<Contact>) => {
    setContacts(contacts.map(c => c.id === id ? { ...c, ...data } : c));
    if (isCloudConnected) {
      await supabase.from('contacts').update(data).eq('id', id);
    }
  };

  const deleteContact = async (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
    if (isCloudConnected) {
      await supabase.from('contacts').delete().eq('id', id);
    }
  };

  // Lead actions
  const addLead = async (data: Omit<Lead, 'id' | 'created_at'>) => {
    const newLead: Lead = {
      ...data,
      id: `led_${Date.now()}`,
      created_at: new Date().toISOString().split('T')[0]
    };
    setLeads([newLead, ...leads]);
    if (isCloudConnected) {
      await supabase.from('leads').insert([newLead]);
    }
  };

  const updateLeadStage = async (id: string, stage: Lead['stage']) => {
    setLeads(leads.map(l => l.id === id ? { ...l, stage } : l));
    if (isCloudConnected) {
      await supabase.from('leads').update({ stage }).eq('id', id);
    }
  };

  const deleteLead = async (id: string) => {
    setLeads(leads.filter(l => l.id !== id));
    if (isCloudConnected) {
      await supabase.from('leads').delete().eq('id', id);
    }
  };

  // Client actions
  const addClient = async (data: Omit<Client, 'id' | 'created_at'>) => {
    const newClient: Client = {
      ...data,
      id: `clt_${Date.now()}`,
      created_at: new Date().toISOString().split('T')[0]
    };
    setClients([newClient, ...clients]);
    if (isCloudConnected) {
      await supabase.from('clients').insert([newClient]);
    }
  };

  const updateClient = async (id: string, data: Partial<Client>) => {
    setClients(clients.map(c => c.id === id ? { ...c, ...data } : c));
    if (isCloudConnected) {
      await supabase.from('clients').update(data).eq('id', id);
    }
  };

  const deleteClient = async (id: string) => {
    setClients(clients.filter(c => c.id !== id));
    if (isCloudConnected) {
      await supabase.from('clients').delete().eq('id', id);
    }
  };

  // Task actions
  const addTask = async (data: Omit<Task, 'id'>) => {
    const newTask: Task = {
      ...data,
      id: `tsk_${Date.now()}`
    };
    setTasks([newTask, ...tasks]);
    if (isCloudConnected) {
      await supabase.from('tasks').insert([newTask]);
    }
  };

  const updateTaskStatus = async (id: string, status: Task['status']) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status } : t));
    if (isCloudConnected) {
      await supabase.from('tasks').update({ status }).eq('id', id);
    }
  };

  const deleteTask = async (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
    if (isCloudConnected) {
      await supabase.from('tasks').delete().eq('id', id);
    }
  };

  // Inbox actions
  const setActiveConversation = (id: string | null) => {
    setActiveConversationId(id);
    if (id) {
      setConversations(conversations.map(c => c.id === id ? { ...c, unread_count: 0 } : c));
    }
  };

  const sendMessage = async (conversationId: string, content: string) => {
    const newMsg: Message = {
      id: `msg_${Date.now()}`,
      conversation_id: conversationId,
      sender_type: 'agent',
      sender_name: profile.full_name,
      content,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => ({
      ...prev,
      [conversationId]: [...(prev[conversationId] || []), newMsg]
    }));

    setConversations(conversations.map(c => c.id === conversationId ? {
      ...c,
      last_message: content,
      updated_at: 'Just now'
    } : c));

    if (isCloudConnected) {
      await supabase.from('messages').insert([newMsg]);
      await supabase.from('conversations').update({ last_message: content, updated_at: new Date().toISOString() }).eq('id', conversationId);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!activeConversationId) return;
    setMessages(prev => ({
      ...prev,
      [activeConversationId]: (prev[activeConversationId] || []).filter(m => m.id !== messageId)
    }));
    if (isCloudConnected) {
      await supabase.from('messages').delete().eq('id', messageId);
    }
  };

  const clearConversation = async (conversationId: string) => {
    setMessages(prev => ({
      ...prev,
      [conversationId]: []
    }));
    setConversations(conversations.map(c => c.id === conversationId ? {
      ...c,
      last_message: 'No messages',
      updated_at: 'Just now'
    } : c));
    if (isCloudConnected) {
      await supabase.from('messages').delete().eq('conversation_id', conversationId);
    }
  };

  const deleteConversation = async (conversationId: string) => {
    setConversations(conversations.filter(c => c.id !== conversationId));
    if (activeConversationId === conversationId) {
      setActiveConversationId(null);
    }
    if (isCloudConnected) {
      await supabase.from('conversations').delete().eq('id', conversationId);
    }
  };

  // Campaign actions
  const addCampaign = async (data: Omit<Campaign, 'id'>) => {
    const newCamp: Campaign = {
      ...data,
      id: `cmp_${Date.now()}`
    };
    setCampaigns([newCamp, ...campaigns]);
    if (isCloudConnected) {
      await supabase.from('campaigns').insert([newCamp]);
    }
  };

  const markNotificationRead = (id: string) => {
    setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
  };

  return (
    <AppContext.Provider value={{
      profile,
      contacts,
      leads,
      clients,
      tasks,
      conversations,
      messages,
      activeConversationId,
      campaigns,
      notifications,
      activeTab,
      setActiveTab,
      isCloudConnected,
      addContact,
      updateContact,
      deleteContact,
      addLead,
      updateLeadStage,
      deleteLead,
      addClient,
      updateClient,
      deleteClient,
      addTask,
      updateTaskStatus,
      deleteTask,
      setActiveConversation,
      sendMessage,
      deleteMessage,
      clearConversation,
      deleteConversation,
      addCampaign,
      markNotificationRead
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
