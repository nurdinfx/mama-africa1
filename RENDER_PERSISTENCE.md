# Fixing Image Persistence on Render

The "404 Not Found" errors for images and the issue where "all images removed when refreshing" occur because **Render has an ephemeral filesystem**. This means any files uploaded to the server's disk are deleted every time the server restarts or you deploy a new version.

To fix this, you have two options. **Option 1 (Cloudinary)** is recommended.

## Option 1: Use Cloudinary (Recommended)

Cloudinary is a free service that hosts images for you. The application is already built to support it.

1.  **Sign up** for a free account at [cloudinary.com](https://cloudinary.com/).
2.  Get your **Cloud Name**, **API Key**, and **API Secret** from the dashboard.
3.  Go to your **Render Dashboard** -> **Environment** settings.
4.  Add the following Environment Variables:
    *   `CLOUDINARY_CLOUD_NAME`: (your cloud name)
    *   `CLOUDINARY_API_KEY`: (your api key)
    *   `CLOUDINARY_API_SECRET`: (your api secret)
5.  **Redeploy** (or wait for auto-deploy).

Once these are set, the app will automatically switch to uploading images to Cloudinary, and they will persist forever.

## Option 2: Use Render Persistent Disk (Paid)

If you prefer to keep images on the server, you must pay for a Render Disk.

1.  In Render, go to **Disks** and create a new disk (e.g., named `mama-africa-storage`).
2.  Mount the disk to your service at a specific path, for example: `/var/data`
3.  Go to **Environment** variables for your service.
4.  Add `PERSISTENT_STORAGE_PATH` with value `/var/data` (or whatever mount path you chose).
5.  **Redeploy**.

The app will now save images to that disk, which will survive restarts.
