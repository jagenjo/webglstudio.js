var UndoModule = {
	name: "Undo",

	settings_panel: [{name:"undo", title:"Undo", icon:null }],

	init: function()
	{
		var mainmenu = LiteGUI.menubar;

		mainmenu.add("Edit/Undo", { callback: function() { LiteGUI.doUndo(); }});
		mainmenu.add("Window/Undo history", { callback: function() { UndoModule.showUndoHistoryDialog(); }});

		LiteGUI.bind( LiteGUI.root, "undo", function() {
			RenderModule.requestFrame();
		});

	},

	showUndoHistoryDialog: function()
	{
		var that = this;
		var dialog = new LiteGUI.Dialog("undo-history",{ title:"Undo history", width: 300, height: 500, draggable: true, closable: true });
		dialog.on_close = function(){
			LiteGUI.unbind( LiteGUI.root, "new_undo", inner_update );
			LiteGUI.unbind( LiteGUI.root, "undo", inner_update );
		}
		LiteGUI.bind( LiteGUI.root, "new_undo", inner_update );
		LiteGUI.bind( LiteGUI.root, "undo", inner_update );

		var widgets = new LiteGUI.Inspector();

		var list_widget = widgets.addList( null, [], { height: 400 } );
		widgets.addButton(null,"Step backwards", function(){ LiteGUI.doUndo(); });

		dialog.add( widgets );
		dialog.adjustSize();
		dialog.show();

		inner_update();

		function inner_update()
		{
			var list = [];
			for(var i = 0; i < LiteGUI.undo_steps.length; ++i)
			{
				var step = LiteGUI.undo_steps[i];
				list.push( step.title || "Step" );
			}
			list_widget.setValue( list );
			if(list.length)
				list_widget.selectIndex( list.length - 1 );
		}
	},

	saveSceneUndo: function()
	{
		LiteGUI.addUndoStep({ 
			title: "Scene modified",
			data: JSON.stringify( LS.GlobalScene.serialize() ), //stringify to save some space
			callback: function(d) {
				var selected_node = LS.GlobalScene.selected_node ? LS.GlobalScene.selected_node.uid : null;
				LS.GlobalScene.clear();
				LS.GlobalScene.configure( JSON.parse(d) );
				SelectionModule.setSelection( LS.GlobalScene.getNode( selected_node ) );
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeCreatedUndo: function( node )
	{
		LiteGUI.addUndoStep({ 
			title: "Node created: " + node.name,
			data: { node: node.uid },
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				if(node && node._parentNode)
					node._parentNode.removeChild(node);
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeChangeUndo: function(node)
	{
		LiteGUI.addUndoStep({ 
			title: "Node modified: " + node.name,
			data: { node: node.uid, info: JSON.stringify( node.serialize() ) }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				node.configure( JSON.parse( d.info ) );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},	

	saveNodeRenamedUndo: function(node, old_name)
	{
		LiteGUI.addUndoStep({ 
			title: "Node renamed: " + node.name,
			data: { node: node.uid, old_name: old_name }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				node.setName( d.old_name );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},	

	saveNodeTransformUndo: function( node )
	{
		if(!node || !node.transform)
			return;

		LiteGUI.addUndoStep({
			title: "Node transform: " + node.name,
			data: { node: node.uid, transform: node.transform.serialize() },
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node || !node.transform)
					return;
				node.transform.configure( d.transform );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeParentingUndo: function( node )
	{
		if(!node || !node.parentNode)
			return;

		LiteGUI.addUndoStep({ 
			title: "Node parenting: " + node.name,
			data: { node: node.uid, old_parent: node.parentNode.uid },
			callback: function(d) {
				var scene = LS.GlobalScene;
				var old_parent = scene.getNode( d.old_parent );
				var node = scene.getNode( d.node );
				if(!node || !old_parent)
					return;
				old_parent.addChild( node, null, true);
				RenderModule.requestFrame();
			}
		});
	},

	saveComponentCreatedUndo: function( component )
	{
		if(!component._root)
			return;

		LiteGUI.addUndoStep({ 
			title: "Component created: " + LS.getObjectClassName(component),
			data: { node: component._root.uid, component: component.uid }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				var compo = node.getComponentByUId( d.component );
				if(!compo)
					return;
				node.removeComponent(compo);				
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveComponentChangeUndo: function( component )
	{
		if(!component._root)
			return;

		LiteGUI.addUndoStep({ 
			title: "Component modified: " + LS.getObjectClassName(component),
			data: {  node: component._root.uid, component: component.uid, info: JSON.stringify( component.serialize() ) }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				var compo = node.getComponentByUId( d.component );
				if(!compo)
					return;
				compo.configure( JSON.parse( d.info ) );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveComponentDeletedUndo: function( component )
	{
		if(!component._root)
			return;

		var node = component._root;

		LiteGUI.addUndoStep({ 
			title: "Component Deleted: " + LS.getObjectClassName(component),
			data: { node: node, component: LS.getObjectClassName(component), index: node.getIndexOfComponent( component ), info: JSON.stringify( component.serialize()) }, //stringify to save some space
			callback: function(d) {
				d.node.addComponent( new window[d.component](JSON.parse(d.info)), d.index );
				LEvent.trigger(d.node, "changed");
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveNodeMaterialChangeUndo: function( node )
	{
		LiteGUI.addUndoStep({ 
			title: "Node Material changed: " + node.name,
			data: { node: node.uid, material: node.material }, //stringify to save some space
			callback: function(d) {
				var node = LS.GlobalScene.getNode(d.node);
				if(!node)
					return;
				node.material = d.material;
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},

	saveMaterialChangeUndo: function( material )
	{
		LiteGUI.addUndoStep({ 
			title: "Material modified: " + LS.getObjectClassName(material),
			data: { material: material, info: JSON.stringify( material.serialize() ) }, //stringify to save some space
			callback: function(d) {
				d.material.configure( JSON.parse(d.info) );
				EditorModule.refreshAttributes();
				RenderModule.requestFrame();
			}
		});
	},
}

LiteGUI.registerModule( UndoModule );