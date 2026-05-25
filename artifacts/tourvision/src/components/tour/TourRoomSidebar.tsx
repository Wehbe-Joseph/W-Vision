import { Loader2, PanelLeftClose, Plus } from "lucide-react";
import { roomNavRank } from "@/lib/roomOrder";

export interface SidebarRoom {
  sceneId: string;
  roomType: string;
  isGenerating?: boolean;
}

interface TourRoomSidebarProps {
  rooms: SidebarRoom[];
  activeSceneId: string;
  onSelectRoom: (sceneId: string) => void;
  onAddRoom?: () => void;
  addDisabled?: boolean;
  onClose?: () => void;
}

export default function TourRoomSidebar({
  rooms,
  activeSceneId,
  onSelectRoom,
  onAddRoom,
  addDisabled = false,
  onClose,
}: TourRoomSidebarProps) {
  const ordered = [...rooms].sort(
    (a, b) => roomNavRank(a.roomType) - roomNavRank(b.roomType),
  );

  return (
    <aside className="w-[220px] shrink-0 h-full border-r border-white/10 bg-[#0c0c0c]/95 flex flex-col">
      <div className="px-3 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/45">
          Rooms
        </p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rooms sidebar"
            className="h-7 w-7 rounded-md flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {ordered.map((room) => {
          const active = room.sceneId === activeSceneId;
          return (
            <button
              key={room.sceneId}
              type="button"
              disabled={room.isGenerating}
              onClick={() => onSelectRoom(room.sceneId)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                active
                  ? "bg-white text-black font-semibold"
                  : "text-white/85 hover:bg-white/10"
              } ${room.isGenerating ? "opacity-70 cursor-wait" : ""}`}
            >
              {room.isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
              ) : null}
              <span className="truncate">{room.roomType}</span>
            </button>
          );
        })}
      </nav>

      {onAddRoom ? (
        <div className="p-2 border-t border-white/10">
          <button
            type="button"
            onClick={onAddRoom}
            disabled={addDisabled}
            className="w-full flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-white/25 text-white/80 text-sm hover:bg-white/10 hover:border-white/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add room
          </button>
        </div>
      ) : null}
    </aside>
  );
}
