import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Bot, 
  Send, 
  Plus, 
  Trash2, 
  RefreshCw, 
  MessageSquare, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  Edit3,
  Calendar,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = '/api';

interface Conversation {
  id: number;
  user_id: number;
  title: string;
  created_at: string;
}

interface Message {
  id: number;
  conversation_id: number;
  sender: 'user' | 'mavey';
  content: string;
  created_at: string;
}

const parseInlineStyles = (text: string, onActionClick?: (url: string) => void) => {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} className="font-bold text-slate-100">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={idx} className="italic text-slate-350">{part.slice(1, -1)}</em>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="bg-black/40 px-1.5 py-0.5 rounded font-mono text-[11px] border border-white/5 text-blue-400">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('[') && part.includes('](') && part.endsWith(')')) {
      const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (match) {
        const linkText = match[1];
        const linkUrl = match[2];
        if (linkUrl.startsWith('action:')) {
          return (
            <button
              key={idx}
              onClick={() => onActionClick && onActionClick(linkUrl)}
              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-600/20 hover:bg-blue-600/35 border border-blue-500/35 hover:border-blue-500/50 text-blue-400 hover:text-blue-300 rounded-lg text-[10px] font-black transition-all cursor-pointer ml-1 my-0.5 active:scale-95 shadow-sm pointer-events-auto"
            >
              <Sparkles size={11} className="text-blue-400 animate-pulse" />
              {linkText}
            </button>
          );
        }
        return (
          <a key={idx} href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            {linkText}
          </a>
        );
      }
    }
    return part;
  });
};

const renderMarkdown = (text: string, onActionClick?: (url: string) => void) => {
  if (!text) return null;
  
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  
  let currentListType: 'ol' | 'ul' | null = null;
  let currentListItems: React.ReactNode[] = [];
  let listKey = 0;
  
  const flushList = () => {
    if (currentListItems.length === 0) return;
    if (currentListType === 'ol') {
      elements.push(
        <ol key={`list-${listKey++}`} className="list-none space-y-1.5 my-2 text-slate-350 pl-1">
          {currentListItems}
        </ol>
      );
    } else if (currentListType === 'ul') {
      elements.push(
        <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-1.5 my-2 text-slate-350 pl-4">
          {currentListItems}
        </ul>
      );
    }
    currentListItems = [];
    currentListType = null;
  };
  
  let insideCodeBlock = false;
  let codeBlockLines: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Code block check
    if (line.trim().startsWith('```')) {
      if (insideCodeBlock) {
        // End code block
        elements.push(
          <pre key={`code-${listKey++}`} className="bg-slate-950/70 border border-white/5 rounded-xl p-3.5 my-3 font-mono text-[11px] text-blue-300 overflow-x-auto">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        insideCodeBlock = false;
      } else {
        flushList();
        insideCodeBlock = true;
      }
      continue;
    }
    
    if (insideCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }
    
    // Headers
    if (line.startsWith('### ')) {
      flushList();
      elements.push(
        <h4 key={`h4-${i}`} className="text-xs font-bold text-slate-200 mt-4 mb-2 uppercase tracking-wider font-mono">
          {parseInlineStyles(line.substring(4), onActionClick)}
        </h4>
      );
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-bold text-slate-100 mt-5 mb-2.5 font-serif">
          {parseInlineStyles(line.substring(3), onActionClick)}
        </h3>
      );
      continue;
    }
    if (line.startsWith('# ')) {
      flushList();
      elements.push(
        <h2 key={`h2-${i}`} className="text-base font-bold text-slate-100 mt-6 mb-3 font-serif">
          {parseInlineStyles(line.substring(2), onActionClick)}
        </h2>
      );
      continue;
    }
    
    // Blank lines
    if (line.trim() === '') {
      flushList();
      continue;
    }
    
    // Matchers
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    const ulMatch = line.match(/^(\s*)([-*])\s+(.*)$/);
    
    if (olMatch) {
      const content = olMatch[3];
      if (currentListType !== 'ol') {
        flushList();
        currentListType = 'ol';
      }
      currentListItems.push(
        <li key={`li-${i}`} className="text-xs leading-relaxed my-1 list-none flex items-start gap-1.5">
          <span className="font-bold text-slate-200 flex-shrink-0 min-w-[15px]">{olMatch[2]}.</span>
          <span className="flex-1">{parseInlineStyles(content, onActionClick)}</span>
        </li>
      );
    } else if (ulMatch) {
      const content = ulMatch[3];
      if (currentListType === 'ol') {
        // Nested bullet inside active numbered list: render as indented bullet li under the active ol item.
        currentListItems.push(
          <li key={`nested-li-${i}`} className="list-none pl-6 text-xs text-slate-400 leading-relaxed my-0.5 flex items-start gap-1.5">
            <span className="text-slate-500 flex-shrink-0">•</span>
            <span className="flex-1">{parseInlineStyles(content, onActionClick)}</span>
          </li>
        );
      } else {
        if (currentListType !== 'ul') {
          flushList();
          currentListType = 'ul';
        }
        currentListItems.push(
          <li key={`li-${i}`} className="text-xs leading-relaxed my-1 pl-1">
            {parseInlineStyles(content, onActionClick)}
          </li>
        );
      }
    } else {
      flushList();
      elements.push(
        <p key={`p-${i}`} className="text-xs leading-relaxed text-slate-300 my-1">
          {parseInlineStyles(line, onActionClick)}
        </p>
      );
    }
  }
  
  flushList();
  return elements;
};

const SUGGESTIONS = [
  { text: "Is my eBay account connected?", icon: Sparkles },
  { text: "Suggest improvements for my oldest unsold items", icon: Layers },
  { text: "Generate a pick list for today's sales", icon: Calendar },
  { text: "Add private note 'Needs wash' to item #4", icon: Edit3 }
];

const AskMavey: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = async (selectFirst = false) => {
    try {
      const res = await axios.get(`${API_BASE}/mavey/conversations`);
      setConversations(res.data);
      if (selectFirst && res.data.length > 0 && !activeChat) {
        setActiveChat(res.data[0]);
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadConversations(true);
  }, []);

  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setLoadingMessages(true);
      setErrorText(null);
      try {
        const res = await axios.get(`${API_BASE}/mavey/conversations/${activeChat.id}/messages`);
        setMessages(res.data);
      } catch (err) {
        setErrorText('Failed to load message history.');
      } finally {
        setLoadingMessages(false);
      }
    };

    loadMessages();
  }, [activeChat]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendingMessage]);

  const handleStartNewConversation = async (customTitle?: string) => {
    try {
      const title = customTitle || `Chat ${new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}`;
      const res = await axios.post(`${API_BASE}/mavey/conversations`, { title });
      const newConv = res.data;
      setConversations(prev => [newConv, ...prev]);
      setActiveChat(newConv);
      return newConv;
    } catch (err) {
      alert('Failed to start a new chat');
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this chat history?')) return;

    try {
      await axios.delete(`${API_BASE}/mavey/conversations/${id}`);
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeChat?.id === id) {
        setActiveChat(null);
      }
    } catch (err) {
      alert('Failed to delete chat');
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    let targetChat = activeChat;
    if (!targetChat) {
      // Create new chat session on the fly
      const title = text.length > 25 ? text.substring(0, 25) + '...' : text;
      targetChat = await handleStartNewConversation(title);
    }

    if (!targetChat) return;

    setInputText('');
    setSendingMessage(true);
    setErrorText(null);
    setActionMessage(null);

    // Append user's local message instantly
    const localUserMsg: Message = {
      id: Date.now(), // temporary key
      conversation_id: targetChat.id,
      sender: 'user',
      content: text,
      created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, localUserMsg]);

    try {
      const response = await axios.post(`${API_BASE}/mavey/chat`, {
        conversationId: targetChat.id,
        message: text
      });

      const data = response.data;
      
      // Update messages feed with database saved responses
      const refreshRes = await axios.get(`${API_BASE}/mavey/conversations/${targetChat.id}/messages`);
      setMessages(refreshRes.data);

      if (data.actionPerformed) {
        setActionMessage(data.actionPerformed);
        setTimeout(() => setActionMessage(null), 5000);
      }
    } catch (err: any) {
      setErrorText(err.response?.data?.error || 'Mavey timed out or encountered an issue. Make sure your Ollama instance is running.');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleExecuteActionLink = (linkUrl: string) => {
    try {
      const query = linkUrl.substring(linkUrl.indexOf('?') + 1);
      const params = new URLSearchParams(query);
      const itemId = params.get('itemId');
      const title = params.get('title');
      const price = params.get('price');
      const desc = params.get('description');
      
      let msg = `Apply improvements to item #${itemId}:`;
      if (title) msg += ` title: "${title}"`;
      if (price) msg += `, price: "${price}"`;
      if (desc) msg += `, description: "${desc}"`;
      
      handleSendMessage(msg);
    } catch (err) {
      console.error('Failed to parse action link:', err);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 min-h-[calc(100vh-10rem)] max-h-[85vh]">
      
      {/* LEFT: Conversations History Panel */}
      <div className="glass-card flex flex-col h-[75vh] min-h-[500px]">
        <div className="pb-4 border-b border-white/5 flex-shrink-0">
          <button
            onClick={() => handleStartNewConversation()}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 text-xs font-bold cursor-pointer"
          >
            <Plus size={16} />
            New Mavey Session
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pt-4 space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-950">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 px-2 mb-2">Previous Chats</p>
          {loadingHistory ? (
            <div className="flex justify-center py-6 text-slate-500">
              <RefreshCw className="animate-spin" size={16} />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-center text-xs text-slate-600 py-6 italic font-sans">No previous sessions</p>
          ) : (
            conversations.map((c) => {
              const isActive = activeChat?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveChat(c)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer group border ${
                    isActive 
                      ? 'bg-blue-600/15 border-blue-500/25 text-slate-100 shadow-md shadow-blue-500/5' 
                      : 'border-transparent text-slate-400 hover:text-white hover:bg-slate-900/60'
                  }`}
                >
                  <MessageSquare size={14} className={isActive ? 'text-blue-400' : 'text-slate-500'} />
                  <span className="text-xs font-semibold truncate flex-1">{c.title}</span>
                  <button
                    onClick={(e) => handleDeleteConversation(e, c.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                    title="Delete Chat"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT: Chat Feed & Workspace Panel */}
      <div className="glass-card md:col-span-3 flex flex-col h-[75vh] min-h-[500px] p-6">
        
        {/* Chat Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 relative">
              <Bot size={18} className="animate-glow" />
              <div className="absolute right-0 bottom-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-slate-950"></div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Ask Mavey</h3>
              <p className="text-[9px] text-slate-500 font-mono font-bold uppercase tracking-wider">
                {activeChat ? `Session: ${activeChat.title}` : 'MarketMaven Copilot'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] font-black uppercase text-blue-400 tracking-wider">
              Local Agent
            </span>
          </div>
        </div>

        {/* Chat Bubbles Area */}
        <div className="flex-1 overflow-y-auto py-6 space-y-4 pr-1 scrollbar-thin scrollbar-thumb-slate-950">
          
          <AnimatePresence>
            {/* Action Execution Alert Popups */}
            {actionMessage && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-green-500/10 border border-green-500/20 rounded-xl p-3.5 flex items-center gap-3 text-green-400 font-sans text-xs font-semibold shadow-lg shadow-green-500/5 mx-2"
              >
                <CheckCircle2 size={16} className="flex-shrink-0" />
                <span>Mavey automated action successfully: {actionMessage}</span>
              </motion.div>
            )}

            {errorText && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 flex items-start gap-3 text-red-400 font-sans text-xs font-semibold shadow-lg shadow-red-500/5 mx-2"
              >
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <div>
                  <span className="block font-bold">Mavey AI Error</span>
                  <span className="text-slate-400 font-normal mt-0.5 block">{errorText}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {loadingMessages ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-500 gap-3">
              <RefreshCw className="animate-spin text-blue-500" size={20} />
              <p className="text-xs font-semibold animate-pulse font-sans">Loading conversation history...</p>
            </div>
          ) : (
            <>
              {/* Empty Chat Welcome State */}
              {!activeChat && messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center max-w-md mx-auto space-y-6">
                  <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/5">
                    <Bot size={28} className="animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-serif text-lg font-bold text-slate-100">Meet Mavey, your smart assistant</h4>
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Ask troubleshooting questions, view inventory analytics, suggest listing enhancements, or perform automated database edits instantly.
                    </p>
                  </div>

                  {/* Suggestions Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full pt-4 font-sans text-left">
                    {SUGGESTIONS.map((sug, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSendMessage(sug.text)}
                        className="p-3.5 bg-slate-950/30 border border-slate-900 rounded-xl hover:border-blue-500/30 hover:bg-slate-900/60 transition-all text-xs text-slate-400 hover:text-slate-200 cursor-pointer flex flex-col justify-between h-24 group"
                      >
                        <sug.icon size={16} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                        <span className="font-medium mt-2">{sug.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages Feed */}
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start gap-2.5 max-w-[85%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      
                      {/* Chat Avatar */}
                      {!isUser && (
                        <div className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400 flex-shrink-0 mt-0.5">
                          <Bot size={13} />
                        </div>
                      )}

                      {/* Message bubble */}
                      <div
                        className={`rounded-2xl px-4 py-2.5 shadow-sm font-sans ${
                          isUser
                            ? 'bg-blue-600/80 text-white rounded-tr-none border border-blue-500/20'
                            : 'bg-slate-950/45 border border-slate-900/80 text-slate-200 rounded-tl-none flex flex-col gap-2'
                        }`}
                      >
                        {isUser ? (
                          <p className="text-xs leading-relaxed">{msg.content}</p>
                        ) : (
                          <div className="space-y-2">
                            {renderMarkdown(msg.content, handleExecuteActionLink)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Thinking loading indicator */}
              {sendingMessage && (
                <div className="flex w-full justify-start">
                  <div className="flex items-start gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center text-blue-400 flex-shrink-0 mt-0.5">
                      <Bot size={13} />
                    </div>
                    <div className="bg-slate-950/45 border border-slate-900/80 rounded-2xl rounded-tl-none px-4 py-3 text-xs text-slate-400 flex items-center gap-2 font-semibold">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                      </span>
                      <span>Mavey is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form area */}
        <div className="pt-4 border-t border-white/5 flex-shrink-0 font-sans">
          
          {/* Quick suggestions if active chat is running and has messages */}
          {activeChat && messages.length > 0 && messages.length < 6 && (
            <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-none scroll-smooth">
              {SUGGESTIONS.slice(0, 3).map((sug, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(sug.text)}
                  className="px-3 py-1.5 bg-slate-950/30 border border-slate-900 rounded-full hover:border-blue-500/30 hover:bg-slate-900/60 text-[10px] text-slate-450 hover:text-slate-200 font-semibold cursor-pointer whitespace-nowrap transition-all"
                >
                  {sug.text}
                </button>
              ))}
            </div>
          )}

          <form 
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
            className="flex items-center gap-3 relative"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={sendingMessage}
              placeholder="Ask Mavey to search inventory, write notes, optimize tags, or check eBay status..."
              className="w-full bg-slate-950 border border-slate-900 rounded-xl pl-4 pr-12 py-3.5 text-xs focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all text-slate-200"
            />
            <button
              type="submit"
              disabled={sendingMessage || !inputText.trim()}
              className={`absolute right-2 p-2 rounded-lg transition-all ${
                inputText.trim() 
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer' 
                  : 'text-slate-600 bg-transparent cursor-not-allowed'
              }`}
            >
              <Send size={15} />
            </button>
          </form>
          
          <div className="flex justify-between items-center text-[9px] text-slate-500 uppercase tracking-widest font-black mt-2.5 px-1">
            <span>MarketMaven Premium - Unlimited Local Usage</span>
            <span>Local Ollama Service Connection</span>
          </div>
        </div>

      </div>

    </div>
  );
};

export default AskMavey;
