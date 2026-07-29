import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AddMemberForm } from './AddMemberForm';
import { EditMemberForm } from './EditMemberForm';
import { RemoveMemberForm } from './RemoveMemberForm';

export function AdminPanel() {
  return (
    <div className="max-w-2xl">
      <Tabs defaultValue="add">
        <TabsList>
          <TabsTrigger value="add">Add New Member</TabsTrigger>
          <TabsTrigger value="edit">Edit Member</TabsTrigger>
          <TabsTrigger value="remove">Remove Member</TabsTrigger>
        </TabsList>
        <TabsContent value="add" className="pt-4">
          <AddMemberForm />
        </TabsContent>
        <TabsContent value="edit" className="pt-4">
          <EditMemberForm />
        </TabsContent>
        <TabsContent value="remove" className="pt-4">
          <RemoveMemberForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
