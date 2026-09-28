export interface UserNode {
    readonly id: string;
    readonly username: string;
    readonly full_name: string;
    readonly profile_pic_url: string;
    readonly is_private: boolean;
    readonly is_verified: boolean;
    readonly followed_by_viewer: boolean;
    readonly follows_viewer: boolean;
    readonly requested_by_viewer: boolean;
}
