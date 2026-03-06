import * as React from 'react';
export const Form = ({ children, ...props }: any) => <form {...props}>{children}</form>;
export const FormField = ({ render, ...props }: any) => render ? render({ field: {} }) : null;
export const FormItem = ({ children }: any) => <div>{children}</div>;
export const FormLabel = ({ children }: any) => <label>{children}</label>;
export const FormControl = ({ children }: any) => <>{children}</>;
export const FormMessage = () => null;
export const FormDescription = ({ children }: any) => <p>{children}</p>;
export const useFormField = () => ({ error: undefined, formItemId: '', formDescriptionId: '', formMessageId: '' });
