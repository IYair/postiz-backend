export const getNotificationImage = (image?: string | null) => {
  try {
    const [firstImage] = JSON.parse(image || '[]');
    return firstImage?.thumbnail || firstImage?.path;
  } catch {
    return undefined;
  }
};
