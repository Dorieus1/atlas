import { useEffect, useRef, useState } from "react";
import { Camera, X, Trash2 } from "lucide-react";

import { getAppointmentPhotos, uploadPhoto, deletePhoto, API_BASE } from "../api/atlasApi";

import EmptyState from "./EmptyState";
import Skeleton from "./Skeleton";


// Quick-capture, not the full customer gallery experience
// (components/PhotoGallery.jsx) - no caption box, just two big buttons
// and a thumbnail strip per side, because the actual moment this gets
// used is a crew member standing in a driveway with one hand full,
// wanting this done in two taps, not a form to fill out. The same photo
// still shows up later in the customer's own gallery (getCustomerPhotos
// already includes appointment_id/photo_type - see photoController's
// shared formatPhoto), tagged with which job it came from.
function JobPhotosModal({ appointmentId, onClose }) {

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uploadingType, setUploadingType] = useState(null);
  const [uploadError, setUploadError] = useState("");
  const [activePhoto, setActivePhoto] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const beforeInputRef = useRef(null);
  const afterInputRef = useRef(null);


  const load = async () => {

    try {

      const data = await getAppointmentPhotos(appointmentId);
      setPhotos(data);
      setLoadError("");

    } catch (err) {

      console.error("JOB PHOTOS LOAD ERROR:", err);
      setLoadError("Couldn't load this job's photos. Please try again.");

    } finally {

      setLoading(false);

    }

  };

  useEffect(() => {

    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);


  const handleFileSelected = async (photoType, e) => {

    const file = e.target.files?.[0];

    e.target.value = "";

    if (!file || uploadingType) {
      return;
    }

    setUploadingType(photoType);
    setUploadError("");

    try {

      await uploadPhoto(null, file, "", { appointmentId, photoType });
      await load();

    } catch (err) {

      console.error("JOB PHOTO UPLOAD ERROR:", err);
      setUploadError(err.message || "Couldn't upload that photo. Please try again.");

    } finally {

      setUploadingType(null);

    }

  };


  const handleDelete = async (id) => {

    setDeleting(true);

    try {

      await deletePhoto(id);
      setActivePhoto(null);
      await load();

    } catch (err) {

      console.error("JOB PHOTO DELETE ERROR:", err);
      setUploadError("Couldn't delete that photo. Please try again.");

    } finally {

      setDeleting(false);

    }

  };


  const beforePhotos = photos.filter((p) => p.photo_type === "before");
  const afterPhotos = photos.filter((p) => p.photo_type === "after");
  const otherPhotos = photos.filter((p) => p.photo_type !== "before" && p.photo_type !== "after");


  const renderThumbs = (list) => (

    <div className="grid grid-cols-3 gap-2">

      {list.map((photo) => (

        <button
          key={photo.id}
          onClick={() => setActivePhoto(photo)}
          className="group relative aspect-square overflow-hidden rounded-lg border border-border"
        >
          <img
            src={`${API_BASE}${photo.url}`}
            alt={photo.photo_type || "Job photo"}
            className="h-full w-full object-cover transition group-hover:opacity-75"
          />
        </button>

      ))}

    </div>

  );


  return (

    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >

      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >

        <div className="flex items-center justify-between">

          <h3 className="flex items-center gap-2 font-display text-lg font-bold">
            <Camera size={18} />
            Job Photos
          </h3>

          <button
            onClick={onClose}
            className="rounded-lg p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
            aria-label="Close"
          >
            <X size={18} />
          </button>

        </div>

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

          <div className="mt-4 flex flex-col gap-3">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>

        ) : (

          <>

            <div className="mt-4">

              <div className="mb-2 flex items-center justify-between">

                <p className="text-sm font-semibold text-fg-muted">
                  Before {beforePhotos.length > 0 && `(${beforePhotos.length})`}
                </p>

                <button
                  onClick={() => beforeInputRef.current?.click()}
                  disabled={uploadingType !== null}
                  className="rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong disabled:opacity-50"
                >
                  {uploadingType === "before" ? "Uploading..." : "+ Add"}
                </button>

                <input
                  ref={beforeInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  onChange={(e) => handleFileSelected("before", e)}
                  className="hidden"
                />

              </div>

              {beforePhotos.length === 0 ? (
                <p className="text-xs text-fg-faint">No before photos yet.</p>
              ) : (
                renderThumbs(beforePhotos)
              )}

            </div>

            <div className="mt-5">

              <div className="mb-2 flex items-center justify-between">

                <p className="text-sm font-semibold text-fg-muted">
                  After {afterPhotos.length > 0 && `(${afterPhotos.length})`}
                </p>

                <button
                  onClick={() => afterInputRef.current?.click()}
                  disabled={uploadingType !== null}
                  className="rounded-lg bg-border px-2.5 py-1.5 text-xs font-medium transition hover:bg-border-strong disabled:opacity-50"
                >
                  {uploadingType === "after" ? "Uploading..." : "+ Add"}
                </button>

                <input
                  ref={afterInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="environment"
                  onChange={(e) => handleFileSelected("after", e)}
                  className="hidden"
                />

              </div>

              {afterPhotos.length === 0 ? (
                <p className="text-xs text-fg-faint">No after photos yet.</p>
              ) : (
                renderThumbs(afterPhotos)
              )}

            </div>

            {otherPhotos.length > 0 && (

              <div className="mt-5">
                <p className="mb-2 text-sm font-semibold text-fg-muted">Other</p>
                {renderThumbs(otherPhotos)}
              </div>

            )}

            {photos.length === 0 && (

              <EmptyState
                icon={Camera}
                title="No photos on this job yet"
                description="Snap a before shot when you arrive, and an after shot once it's done."
              />

            )}

          </>

        )}

      </div>

      {activePhoto && (

        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActivePhoto(null)}
        >

          <div
            className="max-h-[85vh] w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-surface"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="flex items-center justify-between p-3">

              <p className="text-sm capitalize text-fg-muted">
                {activePhoto.photo_type || "Photo"}
              </p>

              <div className="flex items-center gap-1">

                <button
                  onClick={() => handleDelete(activePhoto.id)}
                  disabled={deleting}
                  className="rounded-lg p-2 text-danger transition hover:bg-danger/10 disabled:opacity-50"
                  aria-label="Delete photo"
                >
                  <Trash2 size={16} />
                </button>

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
              alt={activePhoto.photo_type || "Job photo"}
              className="max-h-[70vh] w-full object-contain"
            />

          </div>

        </div>

      )}

    </div>

  );

}

export default JobPhotosModal;
