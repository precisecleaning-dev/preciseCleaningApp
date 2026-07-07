import { useState, useEffect } from 'react';
import { 
  Megaphone, MessageSquare, ThumbsUp, CheckCheck, Send, Clock, X, Trash2, Users
} from 'lucide-react';

import { db } from '../config/firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import type { SystemUser, Role } from '../types/index';
import './NoticeBoardView.css';

// --- INTERFACES LOCALES ---
interface Announcement {
  id?: string;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  createdAt: string;
  likes: string[]; // Array de IDs de usuarios que dieron like
  seenBy: string[]; // Array de IDs de usuarios que marcaron como visto
}

interface Comment {
  id?: string;
  announcementId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface NoticeBoardViewProps {
  onOpenMenu: () => void;
  currentUser?: SystemUser | null;
  activeRole?: Role | null;
  isSuperAdmin?: boolean;
}

export default function NoticeBoardView({ onOpenMenu, currentUser, isSuperAdmin }: NoticeBoardViewProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [usersList, setUsersList] = useState<SystemUser[]>([]); // Lista oficial de usuarios
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Estados para crear nuevo post (Solo Admin)
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [newPostTitle, setNewPostTitle] = useState('');
  const [newPostContent, setNewPostContent] = useState('');

  // Estado para nuevos comentarios
  const [newComments, setNewComments] = useState<Record<string, string>>({});

  // Mostrar u ocultar sección de comentarios por post
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Descargamos posts, comentarios y usuarios del sistema al mismo tiempo
      const [postsSnap, commentsSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'announcements')),
        getDocs(collection(db, 'announcement_comments')),
        getDocs(collection(db, 'system_users'))
      ]);
      
      const loadedPosts = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Announcement));
      loadedPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      const loadedComments = commentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Comment));
      loadedComments.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      const loadedUsers = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as SystemUser));

      setAnnouncements(loadedPosts);
      setComments(loadedComments);
      setUsersList(loadedUsers);
    } catch (error) {
      console.error("Error fetching notice board data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Función para traducir IDs de usuarios a sus nombres reales
  const getUserNamesList = (userIds: string[]) => {
    if (!userIds || userIds.length === 0) return '';
    return userIds.map(id => {
      // Si el ID es el de respaldo del sistema
      if (id === 'system_admin') return 'Administrator';
      
      // Buscar en la base de datos de usuarios
      const user = usersList.find(u => u.id === id);
      return user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
    }).join(', ');
  };

  const handleCreatePost = async () => {
    if (!newPostTitle.trim() || !newPostContent.trim()) return;
    
    setIsSaving(true);
    try {
      const authorId = currentUser?.id || 'system_admin';
      const authorName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Administrator';

      const newPost: Announcement = {
        title: newPostTitle.trim(),
        content: newPostContent.trim(),
        authorId: authorId,
        authorName: authorName || 'Administrator',
        createdAt: new Date().toISOString(),
        likes: [],
        seenBy: []
      };
      
      const docRef = await addDoc(collection(db, 'announcements'), newPost);
      
      setAnnouncements([{ ...newPost, id: docRef.id }, ...announcements]);
      setNewPostTitle('');
      setNewPostContent('');
      setIsCreatingPost(false);
    } catch (error) {
      console.error("Error creating post:", error);
      alert("Failed to publish announcement. Make sure you have internet connection and permissions.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePost = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this post?")) return;
    setIsSaving(true);
    try {
      await deleteDoc(doc(db, 'announcements', id));
      setAnnouncements(announcements.filter(p => p.id !== id));
    } catch (error) {
      console.error("Error deleting post:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleLike = async (post: Announcement) => {
    if (!post.id) return;
    const currentUserId = currentUser?.id || 'system_admin';
    
    const isLiked = post.likes.includes(currentUserId);
    const newLikes = isLiked 
      ? post.likes.filter(id => id !== currentUserId)
      : [...post.likes, currentUserId];
    
    // Actualización Optimista (UI Inmediata)
    setAnnouncements(announcements.map(p => p.id === post.id ? { ...p, likes: newLikes } : p));

    try {
      await updateDoc(doc(db, 'announcements', post.id), { likes: newLikes });
    } catch (error) {
      console.error("Error updating likes:", error);
      setAnnouncements(announcements.map(p => p.id === post.id ? { ...p, likes: post.likes } : p));
    }
  };

  const handleMarkAsSeen = async (post: Announcement) => {
    if (!post.id) return;
    const currentUserId = currentUser?.id || 'system_admin';
    
    if (post.seenBy.includes(currentUserId)) return;
    
    const newSeenBy = [...post.seenBy, currentUserId];

    // Actualización Optimista
    setAnnouncements(announcements.map(p => p.id === post.id ? { ...p, seenBy: newSeenBy } : p));

    try {
      await updateDoc(doc(db, 'announcements', post.id), { seenBy: newSeenBy });
    } catch (error) {
      console.error("Error marking as seen:", error);
      setAnnouncements(announcements.map(p => p.id === post.id ? { ...p, seenBy: post.seenBy } : p));
    }
  };

  const handleAddComment = async (postId: string) => {
    const text = newComments[postId];
    if (!text || !text.trim()) return;
    
    setIsSaving(true);
    try {
      const authorId = currentUser?.id || 'system_admin';
      const authorName = currentUser ? `${currentUser.firstName} ${currentUser.lastName}`.trim() : 'Administrator';

      const newComment: Comment = {
        announcementId: postId,
        authorId: authorId,
        authorName: authorName || 'Administrator',
        content: text.trim(),
        createdAt: new Date().toISOString()
      };
      
      const docRef = await addDoc(collection(db, 'announcement_comments'), newComment);
      setComments([...comments, { ...newComment, id: docRef.id }]);
      setNewComments({ ...newComments, [postId]: '' });
    } catch (error) {
      console.error("Error adding comment:", error);
      alert("Failed to add comment.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleComments = (postId: string) => {
    setExpandedComments(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="fade-in nb-page">

      {/* HEADER */}
      <header className="nb-header">
        <div className="nb-header-title-group">
          <button className="hamburger-btn" onClick={onOpenMenu}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          </button>
          <div>
            <h1 className="nb-title">Notice Board</h1>
            <p className="nb-subtitle">Company announcements and news</p>
          </div>
        </div>

        {isSuperAdmin && !isCreatingPost && (
          <button
            onClick={() => setIsCreatingPost(true)}
            className="nb-new-btn"
          >
            <Megaphone size={16} /> New Announcement
          </button>
        )}
      </header>

      {/* CREATE POST BOX */}
      {isCreatingPost && (
        <div className="nb-create-box">
          <div className="nb-create-header">
            <h3 className="nb-create-title"><Megaphone size={18} /> Create Announcement</h3>
            <button onClick={() => setIsCreatingPost(false)} className="nb-create-close"><X size={20}/></button>
          </div>

          <input
            type="text"
            placeholder="Important: Write a catchy title here..."
            value={newPostTitle}
            onChange={(e) => setNewPostTitle(e.target.value)}
            className="nb-title-input"
          />
          <textarea
            placeholder="What do you want to communicate to the team?"
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            className="nb-content-textarea"
          ></textarea>

          <div className="nb-create-footer">
            <button
              onClick={handleCreatePost}
              disabled={isSaving || !newPostTitle.trim() || !newPostContent.trim()}
              className="nb-publish-btn"
            >
              {isSaving ? 'Publishing...' : 'Publish Announcement'}
            </button>
          </div>
        </div>
      )}

      {/* FEED */}
      {isLoading ? (
        <div className="nb-loading">Loading board...</div>
      ) : announcements.length === 0 ? (
        <div className="nb-empty">
          <Megaphone size={48} className="nb-empty-icon" />
          <h3>No announcements yet.</h3>
          <p>When administrators post news, they will appear here.</p>
        </div>
      ) : (
        announcements.map((post) => {
          const postComments = comments.filter(c => c.announcementId === post.id);
          
          const currentUserId = currentUser?.id || 'system_admin';
          const hasLiked = post.likes.includes(currentUserId);
          const hasSeen = post.seenBy.includes(currentUserId);
          const isExpanded = expandedComments[post.id as string] || false;

          return (
            <div key={post.id} className="post-card">
              {/* Post Header */}
              <div className="post-header">
                <div className="nb-post-author-row">
                  <div className="post-avatar">
                    {post.authorName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="nb-author-name">{post.authorName}</div>
                    <div className="nb-post-meta">
                      <Clock size={12} /> {formatDateTime(post.createdAt)}
                      {(post.authorName === 'System' || post.authorName === 'Administrator') && <span className="nb-admin-badge">ADMIN</span>}
                    </div>
                  </div>
                </div>
                {isSuperAdmin && (
                  <button onClick={() => handleDeletePost(post.id as string)} className="nb-delete-post-btn" title="Delete Post"><Trash2 size={16} /></button>
                )}
              </div>

              {/* Post Body */}
              <div className="post-body">
                <h3 className="nb-post-title">{post.title}</h3>
                <div className="nb-post-content">{post.content}</div>
              </div>

              {/* Information Stats & Viewer Lists */}
              <div className="nb-stats-wrap">
                <div className="nb-stats-row">
                  <div className="nb-stats-left">
                    <span>{post.likes.length} Likes</span>
                    <span>{postComments.length} Comments</span>
                  </div>
                  <div className="nb-stats-seen">
                    <CheckCheck size={14} color="#10b981" /> {post.seenBy.length} Seen
                  </div>
                </div>

                {/* Listas Detalladas explícitas de quién vio y dio like */}
                {(post.likes.length > 0 || post.seenBy.length > 0) && (
                  <div className="nb-viewer-lists">
                    {post.seenBy.length > 0 && (
                      <div className="nb-viewer-row">
                        <Users size={14} color="#10b981" className="nb-viewer-icon" />
                        <span><strong className="nb-viewer-strong">Seen by:</strong> {getUserNamesList(post.seenBy)}</span>
                      </div>
                    )}
                    {post.likes.length > 0 && (
                      <div className="nb-viewer-row">
                        <ThumbsUp size={14} color="#3b82f6" className="nb-viewer-icon" />
                        <span><strong className="nb-viewer-strong">Liked by:</strong> {getUserNamesList(post.likes)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Interaction Bar */}
              <div className="post-actions">
                <button
                  className={`action-btn nb-action-btn-flex ${hasLiked ? 'liked' : 'default'}`}
                  onClick={() => handleToggleLike(post)}
                >
                  <ThumbsUp size={18} fill={hasLiked ? '#3b82f6' : 'none'} /> {hasLiked ? 'Liked' : 'Like'}
                </button>

                <button
                  className="action-btn nb-action-btn-flex default"
                  onClick={() => toggleComments(post.id as string)}
                >
                  <MessageSquare size={18} /> Comment
                </button>

                {!hasSeen ? (
                  <button
                    className="action-btn nb-action-btn-flex seen-btn"
                    onClick={() => handleMarkAsSeen(post)}
                  >
                    <CheckCheck size={18} /> Mark as Seen
                  </button>
                ) : (
                  <div className="nb-seen-indicator">
                    <CheckCheck size={18} /> Seen by you
                  </div>
                )}
              </div>

              {/* Comments Section */}
              {isExpanded && (
                <div className="comments-section">
                  {postComments.length > 0 && (
                    <div className="nb-comments-list">
                      {postComments.map(comment => (
                        <div key={comment.id} className="nb-comment-row">
                          <div className="nb-comment-avatar">
                            {comment.authorName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="comment-bubble">
                              <div className="nb-comment-author">{comment.authorName}</div>
                              <div className="nb-comment-content">{comment.content}</div>
                            </div>
                            <div className="nb-comment-time">{formatDateTime(comment.createdAt)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Comment Input */}
                  <div className="nb-add-comment-row">
                    <div className="nb-add-comment-avatar">
                      {currentUser?.firstName?.charAt(0).toUpperCase() || 'A'}
                    </div>
                    <div className="nb-comment-input-wrap">
                      <textarea
                        value={newComments[post.id as string] || ''}
                        onChange={(e) => setNewComments({...newComments, [post.id as string]: e.target.value})}
                        placeholder="Write a comment..."
                        className="nb-comment-textarea"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment(post.id as string);
                          }
                        }}
                      />
                      <button
                        onClick={() => handleAddComment(post.id as string)}
                        disabled={isSaving || !(newComments[post.id as string] || '').trim()}
                        className={`nb-send-comment-btn${(newComments[post.id as string] || '').trim() ? ' active' : ''}`}
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          )
        })
      )}
    </div>
  );
}