import { v } from "convex/values";
import { query, mutation, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api, internal } from "./_generated/api";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: process.env.CONVEX_OPENAI_BASE_URL,
  apiKey: process.env.CONVEX_OPENAI_API_KEY,
});

export const getConversations = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    return await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const getMessages = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify user owns this conversation
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

// Internal query for AI to get messages without auth check
export const getMessagesForAI = internalQuery({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", args.conversationId))
      .order("asc")
      .collect();
  },
});

export const createConversation = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    return await ctx.db.insert("conversations", {
      userId,
      title: args.title,
      lastMessageAt: Date.now(),
    });
  },
});

export const sendMessage = mutation({
  args: { 
    conversationId: v.id("conversations"), 
    content: v.string() 
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify user owns this conversation
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.userId !== userId) {
      throw new Error("Conversation not found");
    }

    // Add user message
    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      userId,
      content: args.content,
      role: "user",
      timestamp: Date.now(),
    });

    // Update conversation last message time
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: Date.now(),
    });

    // Schedule AI response
    await ctx.scheduler.runAfter(0, internal.chat.generateAIResponse, {
      conversationId: args.conversationId,
    });
  },
});

export const generateAIResponse = internalAction({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    try {
      // Get conversation messages for context
      const messages = await ctx.runQuery(internal.chat.getMessagesForAI, {
        conversationId: args.conversationId,
      });

      // Prepare messages for OpenAI with enhanced system prompt
      const openaiMessages = [
        {
          role: "system" as const,
          content: `You are Study Buddy, an expert AI tutor specifically designed to help Bachelor of Arts (B.A.) students excel in their academic journey. You have extensive knowledge in:

**Core B.A. Subjects:**
- Literature (English, Comparative, World Literature)
- History (World, American, European, Ancient)
- Philosophy (Ethics, Logic, Political Philosophy)
- Psychology (Cognitive, Social, Developmental)
- Sociology (Social Theory, Research Methods)
- Political Science (Government, International Relations)
- Anthropology (Cultural, Social)
- Art History and Fine Arts
- Languages and Linguistics
- Religious Studies
- Communication Studies

**Your Expertise Includes:**
- Essay writing and structure (thesis development, argumentation, citations)
- Research methodologies and source evaluation
- Critical thinking and analysis techniques
- Study strategies and time management
- Exam preparation and test-taking strategies
- Academic writing styles (MLA, APA, Chicago)
- Discussion facilitation and debate preparation

**Your Teaching Style:**
- Break complex concepts into digestible parts
- Use examples and analogies relevant to undergraduate experience
- Provide step-by-step guidance
- Encourage critical thinking with thought-provoking questions
- Offer multiple perspectives on topics
- Be supportive and motivating
- Adapt explanations to different learning styles

**Response Guidelines:**
- Keep responses comprehensive but accessible
- Use bullet points and clear structure when helpful
- Provide specific examples and case studies
- Suggest additional resources when appropriate
- Ask follow-up questions to deepen understanding
- Maintain an encouraging, professional tone

Always tailor your responses to undergraduate-level understanding while challenging students to think critically.`
        },
        ...messages.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }))
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages: openaiMessages,
        max_tokens: 1500,
        temperature: 0.7,
        presence_penalty: 0.1,
        frequency_penalty: 0.1,
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("No response from AI");
      }

      // Save AI response
      await ctx.runMutation(internal.chat.saveAIMessage, {
        conversationId: args.conversationId,
        content: aiResponse,
      });

    } catch (error) {
      console.error("AI response error:", error);
      
      // Provide more helpful error responses based on error type
      let errorMessage = "I apologize, but I'm experiencing technical difficulties right now. ";
      
      if (error instanceof Error) {
        if (error.message.includes("rate limit")) {
          errorMessage += "I'm currently handling many requests. Please try again in a moment.";
        } else if (error.message.includes("network")) {
          errorMessage += "There seems to be a connection issue. Please check your internet and try again.";
        } else {
          errorMessage += "Please try rephrasing your question or try again in a few moments.";
        }
      } else {
        errorMessage += "Please try again in a moment, and I'll do my best to help you with your studies.";
      }
      
      // Save error message
      await ctx.runMutation(internal.chat.saveAIMessage, {
        conversationId: args.conversationId,
        content: errorMessage,
      });
    }
  },
});

export const saveAIMessage = internalMutation({
  args: { 
    conversationId: v.id("conversations"), 
    content: v.string() 
  },
  handler: async (ctx, args) => {
    // Get conversation to find userId
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      userId: conversation.userId,
      content: args.content,
      role: "assistant",
      timestamp: Date.now(),
    });

    // Update conversation last message time
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: Date.now(),
    });
  },
});

// Add some sample academic content functions
export const getStudyTips = query({
  args: { subject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Return study tips based on subject or general tips
    const generalTips = [
      {
        title: "Active Reading Strategy",
        description: "Use the SQ3R method: Survey, Question, Read, Recite, Review",
        category: "Reading"
      },
      {
        title: "Essay Structure",
        description: "Follow the classic 5-paragraph structure: Introduction, 3 body paragraphs, conclusion",
        category: "Writing"
      },
      {
        title: "Time Management",
        description: "Use the Pomodoro Technique: 25 minutes focused work, 5-minute break",
        category: "Study Skills"
      },
      {
        title: "Critical Thinking",
        description: "Always ask: What? So what? Now what? to analyze any topic deeply",
        category: "Analysis"
      }
    ];

    return generalTips;
  },
});

export const getAcademicResources = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }

    return [
      {
        title: "Citation Guides",
        resources: [
          "MLA Style Guide - For literature and humanities",
          "APA Style Guide - For psychology and social sciences",
          "Chicago Manual of Style - For history and fine arts"
        ]
      },
      {
        title: "Research Databases",
        resources: [
          "JSTOR - Academic articles and books",
          "Project MUSE - Humanities and social sciences",
          "Google Scholar - Free academic search engine"
        ]
      },
      {
        title: "Writing Centers",
        resources: [
          "Purdue OWL - Comprehensive writing resources",
          "University Writing Centers - Local tutoring support",
          "Grammarly - Grammar and style checking"
        ]
      }
    ];
  },
});
