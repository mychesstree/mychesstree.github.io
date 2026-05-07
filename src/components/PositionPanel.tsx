import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { MessageSquare, Send, Trash2, ChevronDown, ChevronUp, X, Eye } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Comment {
    id: string;
    tree_id: string;
    fen: string;
    user_id: string;
    content: string;
    created_at: string;
    users: { username: string };
}

// interface MoveSuggestion {
//     id: string;
//     tree_id: string;
//     fen: string;
//     user_id: string;
//     move_san: string;
//     move_uci: string;
//     resulting_fen: string;
//     note: string | null;
//     upvotes: number;
//     created_at: string;
//     users: { username: string };
//     move_suggestion_votes?: { user_id: string }[];
//     hasVoted?: boolean;
// }

interface PositionPanelProps {
    treeId: string;
    fen: string;
    isPublicTree: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

function Avatar({ username }: { username: string }) {
    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    const color = colors[username.charCodeAt(0) % colors.length];
    return (
        <div style={{
            width: 28, height: 28, borderRadius: '50%',
            backgroundColor: color + '22',
            border: `1.5px solid ${color}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', fontWeight: 700, color, flexShrink: 0,
            letterSpacing: '0.02em'
        }}>
            {username.slice(0, 2).toUpperCase()}
        </div>
    );
}


// ─── Main Component ───────────────────────────────────────────────────────────

export default function PositionPanel({
    treeId,
    fen,
    isPublicTree,
}: PositionPanelProps) {
    const { user, isGuest } = useAuth();
    if (!isPublicTree) return null;

    // Tab state
    const [isExpanded, setIsExpanded] = useState(true);

    // Comments
    const [comments, setComments] = useState<Comment[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    // Suggestions
    // const [pendingMove, setPendingMove] = useState<{ san: string; uci: string; resultingFen: string } | null>(null);

    // Misc
    const [error, setError] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // const suggestTextareaRef = useRef<HTMLTextAreaElement>(null);

    // ── Fetch comments ──────────────────────────────────────────────────────────
    const fetchComments = useCallback(async () => {
        setLoadingComments(true);
        const { data } = await supabase
            .from('position_comments')
            .select('*, users!inner(username)')
            .eq('tree_id', treeId)
            .eq('fen', fen)
            .order('created_at', { ascending: true });
        setComments((data as Comment[]) || []);
        setLoadingComments(false);
    }, [treeId, fen]);


    useEffect(() => {
        fetchComments();
        setCommentText('');
        setError('');
    }, [fen, fetchComments]);

    // ── Submit comment ──────────────────────────────────────────────────────────
    const handleSubmitComment = useCallback(async () => {
        if (!commentText.trim() || !user) return;
        setSubmittingComment(true);
        setError('');
        const { error: err } = await supabase.from('position_comments').insert({
            tree_id: treeId,
            fen,
            user_id: user.id,
            content: commentText.trim(),
        });
        if (err) {
            setError('Failed to post comment.');
        } else {
            setCommentText('');
            fetchComments();
        }
        setSubmittingComment(false);
    }, [commentText, user, treeId, fen, fetchComments]);

    // ── Delete comment ──────────────────────────────────────────────────────────
    const handleDeleteComment = useCallback(async (commentId: string) => {
        await supabase.from('position_comments').delete().eq('id', commentId);
        fetchComments();
    }, [fetchComments]);



    // ── Accept suggestion (owner/editor only) ──────────────────────────────────

    // ── Keyboard shortcuts ──────────────────────────────────────────────────────
    const handleCommentKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmitComment();
    };

    const canPost = !isGuest && !!user;
    const commentCount = comments.length;

    return (
        <div style={{
            borderTop: '1px solid var(--border-color)',
            marginTop: '0.75rem',
        }}>
            {/* ── Panel Header ── */}
            <button
                onClick={() => setIsExpanded(p => !p)}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MessageSquare size={14} style={{ color: 'var(--text-muted)' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        Position Discussion
                    </span>
                    {commentCount > 0 && (
                        <span style={{
                            fontSize: '0.68rem', fontWeight: 700,
                            backgroundColor: 'rgba(236,72,153,0.15)',
                            color: '#ec4899',
                            padding: '0.1rem 0.45rem',
                            borderRadius: 10,
                            border: '1px solid rgba(236,72,153,0.25)',
                        }}>{commentCount}</span>
                    )}
                </div>
                {isExpanded ? <ChevronUp size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />}
            </button>

            {isExpanded && (
                <div style={{ padding: '0 0.75rem 0.75rem' }}>

                    {/* ── Error Banner ── */}
                    {error && (
                        <div style={{
                            padding: '0.5rem 0.75rem',
                            backgroundColor: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.25)',
                            borderRadius: 6,
                            fontSize: '0.78rem',
                            color: '#ef4444',
                            marginBottom: '0.75rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            {error}
                            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0 }}>
                                <X size={12} />
                            </button>
                        </div>
                    )}

                    {/* ════════════════════════════════════════════════════════
              COMMENTS SECTION
          ════════════════════════════════════════════════════════ */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

                        {/* Comment list */}
                        {loadingComments ? (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                <div style={{ width: 20, height: 20, border: '2px solid var(--border-color)', borderTopColor: 'var(--accent-color)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.5rem' }} />
                                Loading…
                            </div>
                        ) : comments.length === 0 ? (
                            <div style={{
                                padding: '1.5rem 1rem',
                                textAlign: 'center',
                                color: 'var(--text-muted)',
                                fontSize: '0.78rem',
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                borderRadius: 8,
                                border: '1px dashed var(--border-color)',
                            }}>
                                <MessageSquare size={20} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                                <div>No comments on this position yet.</div>
                                {!canPost && <div style={{ marginTop: '0.25rem', opacity: 0.6 }}>Sign in to be the first!</div>}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 220, overflowY: 'auto', paddingRight: 2 }}>
                                {comments.map(c => (
                                    <div key={c.id} style={{
                                        padding: '0.6rem 0.75rem',
                                        backgroundColor: 'rgba(255,255,255,0.03)',
                                        borderRadius: 8,
                                        border: '1px solid var(--border-color)',
                                        transition: 'border-color 0.15s',
                                    }}
                                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)')}
                                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                <Avatar username={c.users?.username || '?'} />
                                                <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{c.users?.username}</span>
                                                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{timeAgo(c.created_at)}</span>
                                            </div>
                                            {user?.id === c.user_id && (
                                                <button
                                                    onClick={() => handleDeleteComment(c.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0.1rem', opacity: 0.5, transition: 'opacity 0.15s' }}
                                                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            )}
                                        </div>
                                        <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.5, color: 'var(--text-main)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {c.content}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Comment composer */}
                        {canPost ? (
                            <div style={{
                                marginTop: '0.25rem',
                                backgroundColor: 'rgba(255,255,255,0.03)',
                                borderRadius: 8,
                                border: '1px solid var(--border-color)',
                                overflow: 'hidden',
                                transition: 'border-color 0.15s',
                            }}
                                onFocusCapture={e => (e.currentTarget.style.borderColor = 'var(--accent-color)')}
                                onBlurCapture={e => (e.currentTarget.style.borderColor = 'var(--border-color)')}
                            >
                                <textarea
                                    ref={textareaRef}
                                    value={commentText}
                                    onChange={e => setCommentText(e.target.value)}
                                    onKeyDown={handleCommentKeyDown}
                                    placeholder="Add a comment on this position… (⌘↵ to send)"
                                    rows={2}
                                    style={{
                                        width: '100%',
                                        background: 'none',
                                        border: 'none',
                                        outline: 'none',
                                        resize: 'none',
                                        padding: '0.6rem 0.75rem',
                                        fontSize: '0.82rem',
                                        color: 'var(--text-main)',
                                        fontFamily: 'inherit',
                                        lineHeight: 1.5,
                                        boxSizing: 'border-box',
                                    }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0.25rem 0.5rem' }}>
                                    <button
                                        onClick={handleSubmitComment}
                                        disabled={!commentText.trim() || submittingComment}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.35rem',
                                            padding: '0.3rem 0.75rem',
                                            backgroundColor: commentText.trim() ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)',
                                            color: commentText.trim() ? '#fff' : 'var(--text-muted)',
                                            border: 'none', borderRadius: 6, cursor: commentText.trim() ? 'pointer' : 'default',
                                            fontSize: '0.75rem', fontWeight: 600,
                                            transition: 'all 0.15s',
                                            opacity: submittingComment ? 0.6 : 1,
                                        }}
                                    >
                                        <Send size={11} />
                                        {submittingComment ? 'Posting…' : 'Post'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                textAlign: 'center',
                                backgroundColor: 'rgba(255,255,255,0.02)',
                                borderRadius: 8,
                                border: '1px solid var(--border-color)',
                            }}>
                                <Eye size={12} style={{ marginRight: '0.3rem', verticalAlign: 'middle' }} />
                                Sign in to comment on positions
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}