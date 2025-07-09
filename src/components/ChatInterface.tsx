import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Send, Plus, MessageSquare, BookOpen, Brain, PenTool, Loader2, Lightbulb, GraduationCap } from "lucide-react";

export function ChatInterface() {
  const [selectedConversationId, setSelectedConversationId] = useState<Id<"conversations"> | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const conversations = useQuery(api.chat.getConversations) || [];
  const messages = useQuery(
    api.chat.getMessages,
    selectedConversationId ? { conversationId: selectedConversationId } : "skip"
  ) || [];
  const studyTips = useQuery(api.chat.getStudyTips, {}) || [];
  const academicResources = useQuery(api.chat.getAcademicResources, {}) || [];

  const createConversation = useMutation(api.chat.createConversation);
  const sendMessage = useMutation(api.chat.sendMessage);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0]._id);
    }
  }, [conversations, selectedConversationId]);

  // Check if AI is responding (last message is from user and recent)
  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const isRecentUserMessage = lastMessage.role === "user" && 
        Date.now() - lastMessage.timestamp < 30000; // 30 seconds
      setIsTyping(isRecentUserMessage);
    } else {
      setIsTyping(false);
    }
  }, [messages]);

  const handleNewConversation = async () => {
    const title = `Study Session - ${new Date().toLocaleDateString()}`;
    const conversationId = await createConversation({ title });
    setSelectedConversationId(conversationId);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || !selectedConversationId || isLoading) return;

    setIsLoading(true);
    try {
      await sendMessage({
        conversationId: selectedConversationId,
        content: message.trim(),
      });
      setMessage("");
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setMessage(prompt + " ");
    // Focus the input field
    const input = document.querySelector('input[type="text"]') as HTMLInputElement;
    if (input) {
      input.focus();
    }
  };

  const quickPrompts = [
    { 
      icon: BookOpen, 
      text: "Explain a concept", 
      prompt: "Can you help me understand the concept of",
      color: "text-blue-500"
    },
    { 
      icon: PenTool, 
      text: "Essay writing help", 
      prompt: "I need help writing an essay about",
      color: "text-green-500"
    },
    { 
      icon: Brain, 
      text: "Study strategies", 
      prompt: "What are some effective study strategies for",
      color: "text-purple-500"
    },
    { 
      icon: GraduationCap, 
      text: "Exam preparation", 
      prompt: "How should I prepare for my exam on",
      color: "text-orange-500"
    },
  ];

  const sampleQuestions = [
    "How do I write a strong thesis statement?",
    "What's the difference between primary and secondary sources?",
    "Can you explain the concept of social constructivism?",
    "How do I analyze a poem for literary devices?",
    "What are the key elements of a persuasive argument?",
    "How do I manage my time effectively during finals?",
  ];

  return (
    <div className="flex-1 flex">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <button
            onClick={handleNewConversation}
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-3 rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 shadow-sm hover:shadow-md"
          >
            <Plus className="w-4 h-4" />
            <span className="font-medium">New Study Session</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No study sessions yet</p>
              <p className="text-xs text-gray-400 mt-1">Start your first conversation!</p>
            </div>
          ) : (
            <div className="p-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation._id}
                  onClick={() => setSelectedConversationId(conversation._id)}
                  className={`w-full text-left p-3 rounded-lg mb-2 transition-colors ${
                    selectedConversationId === conversation._id
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-gray-50"
                  }`}
                >
                  <div className="font-medium text-gray-800 truncate">
                    {conversation.title}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(conversation.lastMessageAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Study Tips Section */}
        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center space-x-2 mb-3">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-medium text-gray-700">Quick Tips</span>
          </div>
          <div className="space-y-2">
            {studyTips.slice(0, 2).map((tip, index) => (
              <div key={index} className="text-xs bg-gray-50 p-2 rounded">
                <div className="font-medium text-gray-700">{tip.title}</div>
                <div className="text-gray-600 mt-1">{tip.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedConversationId ? (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 chat-messages">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4">
                    <span className="text-white font-bold text-xl">SB</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">
                    How can I help you study today?
                  </h3>
                  <p className="text-gray-600 mb-6 max-w-md">
                    I'm here to help with essays, research, study strategies, and any B.A. subject questions you have!
                  </p>
                  
                  <div className="grid grid-cols-2 gap-3 max-w-lg mb-6">
                    {quickPrompts.map((prompt, index) => (
                      <button
                        key={index}
                        onClick={() => handleQuickPrompt(prompt.prompt)}
                        className="flex items-center space-x-2 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                      >
                        <prompt.icon className={`w-4 h-4 ${prompt.color}`} />
                        <span className="text-sm text-gray-700">{prompt.text}</span>
                      </button>
                    ))}
                  </div>

                  <div className="max-w-2xl">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Try asking me:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {sampleQuestions.map((question, index) => (
                        <button
                          key={index}
                          onClick={() => setMessage(question)}
                          className="text-xs text-left p-2 bg-gray-50 hover:bg-gray-100 rounded border text-gray-600 hover:text-gray-800 transition-colors"
                        >
                          "{question}"
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg._id}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} message-bubble`}
                    >
                      <div
                        className={`max-w-3xl px-4 py-3 rounded-lg ${
                          msg.role === "user"
                            ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white"
                            : "bg-white border border-gray-200 text-gray-800 shadow-sm"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                        <div
                          className={`text-xs mt-2 ${
                            msg.role === "user" ? "text-blue-100" : "text-gray-500"
                          }`}
                        >
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-gray-200 text-gray-800 shadow-sm px-4 py-3 rounded-lg">
                        <div className="flex items-center space-x-2">
                          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="text-sm text-gray-600">Study Buddy is thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Form */}
            <div className="border-t border-gray-200 bg-white p-4">
              <form onSubmit={handleSendMessage} className="flex space-x-3">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask me anything about your studies..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!message.trim() || isLoading}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>{isLoading ? "Sending..." : "Send"}</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-600 mb-2">
                Select a study session to start chatting
              </h3>
              <p className="text-gray-500">
                Or create a new session to get started with your studies
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
