import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Camera, X, Trash2, Upload, Sparkles } from "lucide-react";

import {
  getCustomerPhotos,
  uploadPhoto,
  deletePhoto,
  draftEstimateFromPhoto,
  API_BASE
} from "../api/atlasApi";

import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";


function PhotoGallery({ customerId }) {

  const navigate = useNavigate();

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);

  const [activePhoto, setActivePhoto] = useState(null);
  const [pendingCaption, setPendingCaption] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState("");

  const fileInputRef = useRef(null);


  const loadPhotos = async () => {

    try {

      const data = await getCustomerPhotos(customerId);
      setPhotos(data);
      setLoadError("");

    } catch (error) {

      console.error("PHOTOS LOAD ERROR:", error);
      setLoadError("Couldn't load photos. Please refresh to try again.");

    } finally {

      setLoading(false);

    }

  };


  useEffect(() => {

    loadPhotos();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);


  const handleFileSelected = async (e) => {

    const file = e.target.files?.[0];

    e.target.value = "";

    if (!file) {
      return;
    }

    if (uploadingRef.current) {
      return;
    }

    uploadingRef.current = true;
    setUploading(true);
    setUploadError("");

    try {

      await uploadPhoto(customerId, file, pendingCaption.trim());
      setPendingCaption("");
      await loadPhotos();

    } catch (error) {

      console.error("PHOTO UPLOAD ERROR:", error);
      setUploadError(error.message || "Couldn't upload that photo. Please try again.");

    } finally {

      uploadingRef.current = false;
      setUploading(false);

    }

  };


  const handleDelete = async (id) => {

    setDeleting(true);

    try {

      await deletePhoto(id);
      setActivePhoto(null);
      setConfirmingDelete(false);
      await loadPhotos();

    } catch (error) {

      console.error("PHOTO DELETE ERROR:", error);
      setUploadError("Couldn't delete that photo. Please try again.");

    } finally {

      setDeleting(false);

    }

  };


  const handleDraftEstimate = async (photo) => {

    setDrafting(true);
    setDraftError("");

    try {

      const draft = await draftEstimateFromPhoto(photo.id);

      if (!draft.items || draft.items.length === 0) {

        setDraftError(draft.summary || "The AI couldn't find anything to estimate in this photo.");
        return;

      }

      navigate("/quotes", {
        state: {
          draftCustomerId: customerId,
          draftItems: draft.items,
          draftSummary: draft.summary
        }
      });

    } catch (error) {

      console.error("DRAFT ESTIMATE ERROR:", error);
      setDraftError(error.message || "Couldn't draft an estimate from that photo. Please try again.");

    } finally {

      setDrafting(false);

    }

  };


  return (

    <div className="rounded-2xl border border-border bg-surface/60 p-6">

      <div className="flex items-center justify-between gap-3">

        <h2 className="text-xl font-bold flex items-center gap-2">
          <Camera size={20} />
          Photos
        </h2>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-500 disabled:opacity-50"
        >
          <Upload size={15} />
          {uploading ? "Uploading..." : "Add Photo"}
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFileSelected}
          className="hidden"
        />

      </div>

      <input
        placeholder="Caption for your next upload (optional)"
        value={pendingCaption}
        onChange={(e) => setPendingCaption(e.target.value)}
        className="mt-3 w-full rounded-lg border border-border bg-surface-muted p-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-border-strong focus:outline-none"
      />

      {loadError && (
        <p className="mt-3 text-sm text-danger">
          {loadError}
        </p>
      )}

      {uploadError && (
        <p className="mt-3 text-sm text-danger">
          {uploadError}
        </p>
      )}

      {loading ? (

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="aspect-square w-full" />
        </div>

      ) : photos.length === 0 ? (

        <EmptyState
          icon={Camera}
          title="No photos yet"
          description="Add before/after shots or damage photos for this customer."
        />

      ) : (

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">

          {photos.map((photo) => (

            <button
              key={photo.id}
              onClick={() => { setActivePhoto(photo); setConfirmingDelete(false); }}
              className="group relative aspect-square overflow-hidden rounded-lg border border-border"
            >
              <img
                src={`${API_BASE}${photo.url}`}
                alt={photo.caption || "Customer photo"}
                className="h-full w-full object-cover transition group-hover:opacity-75"
              />
            </button>

          ))}

        </div>

      )}

      {activePhoto && (

        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActivePhoto(null)}
        >

          <div
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between p-3">

              <p className="truncate text-sm text-fg-muted">
                {confirmingDelete ? "Delete this photo?" : (activePhoto.caption || "Untitled")}
              </p>

              <div className="flex shrink-0 items-center gap-1">

                {confirmingDelete ? (

                  <>

                    <button
                      onClick={() => handleDelete(activePhoto.id)}
                      disabled={deleting}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                    >
                      {deleting ? "Deleting..." : "Confirm"}
                    </button>

                    <button
                      onClick={() => setConfirmingDelete(false)}
                      disabled={deleting}
                      className="rounded-lg bg-border px-3 py-1.5 text-xs font-medium transition hover:bg-border-strong disabled:opacity-50"
                    >
                      Cancel
                    </button>

                  </>

                ) : (

                  <button
                    onClick={() => setConfirmingDelete(true)}
                    className="rounded-lg p-2 text-danger transition hover:bg-danger/10"
                    aria-label="Delete photo"
                  >
                    <Trash2 size={16} />
                  </button>

                )}

                <button
                  onClick={() => setActivePhoto(null)}
                  className="rounded-lg p-2 text-fg-muted transition hover:bg-surface-muted hover:text-fg"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>

              </div>

            </div>

            <img
              src={`${API_BASE}${activePhoto.url}`}
              alt={activePhoto.caption || "Customer photo"}
              className="max-h-[70vh] w-full object-contain"
            />

            <div className="border-t border-border p-3">

              {draftError && (
                <p className="mb-2 text-xs text-danger">
                  {draftError}
                </p>
              )}

              <button
                onClick={() => handleDraftEstimate(activePhoto)}
                disabled={drafting}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600/15 px-3 py-2 text-sm font-semibold text-accent-text transition hover:bg-brand-600/25 disabled:opacity-50"
              >
                <Sparkles size={15} />
                {drafting ? "Looking at the photo..." : "Draft Estimate with AI"}
              </button>

            </div>

          </div>

        </div>

      )}

    </div>

  );

}

export default PhotoGallery;
