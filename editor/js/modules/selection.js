//in charge of selection 
var SelectionModule = {
	name: "SelectionModule",

	selection: null, // { uid, instance, node, info }
	selection_array: [],

	last_selection_change: 0, //used from blinking
	blink: 0,

	init: function()
	{
		LEvent.bind( LS.GlobalScene, "treeItemRemoved", this.onNodeRemoved, this );
		LiteGUI.menubar.add("Edit/Selection/Group to node", {callback: this.groupSelection.bind(this) });
		LiteGUI.menubar.add("Edit/Selection/Save", {callback: this.saveSelection.bind(this) });
		LiteGUI.menubar.add("Edit/Selection/Restore", {callback: this.restoreSelection.bind(this) });

	},

	onNodeRemoved: function(e, node)
	{
		if(this.isSelected( node ))
			this.removeFromSelection( node );
	},

	groupSelection: function()
	{
		var node = new LS.SceneNode();
		LS.GlobalScene.root.addChild( node );
		for(var i = 0; i < this.selection_array.length; ++i)
		{
			var selection = this.selection_array[i];
			if(!selection.node)
				continue;
			node.addChild( selection.node );
		}
		this.setSelection(node);
		LS.GlobalScene.requestFrame();
	},

	//expect something along { instance: *, node: SceneNode, uid: String, data: * }
	setSelection: function( selection, skip_events )
	{
		this.last_selection_change = getTime();
		this.blink = 4;

		//clear selection
		if (!selection)
		{
			//nothing selected
			if(!this.selection)
				return;

			clear_selection();

			this.selection = null;
			this.selection_array = [];

			if(!skip_events)
			{
				LEvent.trigger( LS.GlobalScene, "selected_node_changed");
				EditorModule.inspect( null );
			}

			RenderModule.requestFrame();
			return;
		}

		//in case the selection has strange structure
		selection = this.convertSelection( selection );

		//same selection
		if(this.selection && this.selection.uid && this.selection.uid == selection.uid )
			return false;

		//remove selection
		clear_selection();

		//store
		this.selection = selection;
		this.selection_array = [ selection ];

		var scene = LS.GlobalScene;

		//Scene likes to know the selected node
		scene.selected_node = selection.node;

		if(selection.node)
			selection.node._is_selected = true;

		//send event
		if(!skip_events)
		{
			LEvent.trigger( scene, "selected_node_changed", selection.node);
			EditorModule.inspect( selection.node );
		}

		//repaint
		RenderModule.requestFrame();

		function clear_selection()
		{
			for(var i = 0; i < SelectionModule.selection_array.length; i++)
			{
				var node = SelectionModule.selection_array[i].node;
				if(node)
					node._is_selected = false;
			}
		}

		if(!LS.GlobalScene.extra.editor)
			LS.GlobalScene.extra.editor = {};
		LS.GlobalScene.extra.editor.selected_node = scene.selected_node ? scene.selected_node.uid : null;

		return true;
	},

	setMultipleSelection: function( selection, skip_events )
	{
		if(!selection || selection.length == 1)
			return this.setSelection( selection[0], skip_events );

		for(var i = 0; i < selection.length; i++)
		{
			if(i == 0)
				this.setSelection( selection[i], skip_events )
			else
				this.addToSelection( selection[i], skip_events )
		}
	},

	addToSelection: function( selection, skip_events  )
	{
		if(!selection || this.selection == null)
			return this.setSelection( selection, skip_events );

		//in case the selection has strange structure
		selection = this.convertSelection( selection );

		if( this.isSelected( selection ) )
			return;

		//send event
		var scene = LS.GlobalScene;
		if(!skip_events)
			LEvent.trigger( scene, "other_node_selected", selection.node );

		this.selection_array.push( selection );
		if(selection.node)
			selection.node._is_selected = true;

		//repaint
		RenderModule.requestFrame();
	},

	removeFromSelection: function( instance, skip_events )
	{
		if(!instance || this.selection == null)
			return;

		for(var i = 0; i < this.selection_array.length; ++i)
		{
			var selection = this.selection_array[i];
			if(selection.instance == instance )
			{
				this.selection_array.splice(i,1);
				if(selection.node)
					selection.node._is_selected = false;


				if(selection == this.selection)
				{
					this.selection = this.selection_array[0];
					EditorModule.inspect( null );
				}

				if(!skip_events)
				{
					if(i == 0)
						LEvent.trigger( LS.GlobalScene, "selected_node_changed", this.selection ? this.selection.node : null );
					else
						LEvent.trigger( LS.GlobalScene, "other_node_deselected", this.selection ? this.selection.node : null );
				}
				return;			
			}
		}
	},

	//returns the instance in a selection form
	convertSelection: function( selection )
	{
		if(!selection.instance)
			selection = { instance: selection };

		var instance = selection.instance;

		//selecting a generic scene node
		if(instance.constructor === LS.SceneNode)
			selection.node = instance;
		else if(instance._root && instance._root.constructor === LS.SceneNode) //it is a component
			selection.node = instance._root;

		//if no unique id is received, just try to create one
		var uid = selection.uid || instance.uid || instance._uid || instance.id;

		if(!selection.uid)
		{
			selection.uid = uid;
			if(selection.info)
				selection.uid += "|" + JSON.stringify(selection.info);
		}

		return selection;
	},

	isSelected: function( instance )
	{
		if( !this.selection )
			return false;

		for(var i = 0; i < this.selection_array.length; ++i)
			if(this.selection_array[i].instance == instance )
				return true;
		return false;
	},

	getSelection: function()
	{
		if(!this.selection)
			return null;
		//the node part of the selection
		return this.selection;
	},

	getSelectionCenter: function()
	{
		if(!this.selection)
			return null;

		var box = BBox.create();
		var center = vec3.create();
		var pos = vec3.create();

		var num = 0;

		for(var i = 0; i < this.selection_array.length; i++)
		{
			var selection = this.selection_array[i];
			if(!selection.node)
				continue;
			num++;

			var node = selection.node;

			if(node._instances && node._instances.length)
			{
				vec3.zero( pos );
				for(var j = 0; j < node._instances.length; j++)
					vec3.add( pos, pos, BBox.getCenter( node._instances[j].aabb ) );
				vec3.scale(pos, pos, 1 / node._instances.length);
			}
			else if(node.transform)
				node.transform.getGlobalPosition(pos);

			vec3.add( center, center, pos );
		}

		if(num)
			vec3.scale(center, center, 1/num);

		return center;
	},

	isAncestorSelected: function( node )
	{
		if( !this.selection )
			return false;

		while( node._parentNode )
		{
			if( this.isSelected( node._parentNode ) )
				return true;
			node = node._parentNode;
		}

		return false;
	},

	getSelectionTransform: function()
	{
		if(!this.selection)
			return null;

		if( this.selection.instance.getTransformMatrix )
		{
			var result = this.selection.instance.getTransformMatrix( this.selection.info, null, this.selection );
			if(result)
				return result;
		}

		if( this.selection.node && this.selection.node.transform )
			return this.selection.node.transform.getGlobalMatrixWithoutScale();

		return null;
	},

	applyTransformToSelection: function(transform, center, node)
	{
		console.warn("using applyTransformToSelection, not tested, remove this once tested");

		if(!this.selection)
			return;

		LS.GlobalScene.refresh();

		for(var i = 0; i < this.selection_array.length; i++)
		{
			var selection = this.selection_array[i];

			if( selection.instance.applyTransform )
			{
				var r =  selection.instance.applyTransform( transform, center, this.selection.info, this.selection );
				if(r == true)
					continue;
			}

			var selection_node = node || selection.node;
			if(selection_node && selection_node.applyTransform)
				selection_node.applyTransform( transform, center, true);
			else if(selection_node && selection_node.transform)
				selection_node.transform.applyTransform( transform, center, true);

			//convert to matrix and try again
			var mat = transform.getMatrix();
			this.applyTransformMatrixToSelection( mat, center, selection_node, [selection] );
		}
	},

	applyTransformMatrixToSelection: function( matrix, center, node, selection_array )
	{
		selection_array = selection_array || this.selection_array;
		if(!selection_array || selection_array.length == 0)
			return;

		LS.GlobalScene.refresh();

		for(var i = 0; i < selection_array.length; i++)
		{
			var selection = selection_array[i];
			var M = matrix;

			if( selection.instance.applyTransformMatrix )
			{
				var r = selection.instance.applyTransformMatrix( matrix, center, selection.info, this.selection );
				if(r == true)
					continue;
			}

			var selection_node = node || selection.node;

			//avoid moving children when moving parent
			if( this.isAncestorSelected( selection_node ) )
				continue;

			if(selection_node && selection_node.applyTransformMatrix)
				selection_node.applyTransformMatrix( M, center, true );
			else if(selection_node && selection_node.transform)
				selection_node.transform.applyTransformMatrix( M, center, true );
		}
	},

	getSelectedNode: function()
	{
		if(!this.selection)
			return null;
		//the node part of the selection
		if(this.selection.node && !this.selection.node.scene)
			return null; //cannot select a node that is not in a scene
		return this.selection.node;
	},

	//return all the nodes selected
	getSelectedNodes: function()
	{
		var nodes = [];
		for(var i = 0; i < this.selection_array.length; ++i)
			if( this.selection_array[i].node )
				nodes.push( this.selection_array[i].node );
		return nodes;
	},

	getSelectedNodesInfo: function()
	{
		return this.selection_array;
	},
	
	//returns and array with every selected node uid, used mostly for UNDO
	getSelectionUIds: function()
	{
		var result = [];
		for(var i = 0; i < this.selection_array.length; i++)
		{
			var selection = this.selection_array[i];
			result.push( selection.uid );
		}
		return result;
	},

	setSelectionFromUIds: function(uids)
	{
		var nodes = [];
		for(var i = 0; i < uids.length; i++)
		{
			var node = LS.GlobalScene.getNodeByUId( uids[i] );
			if(node)
				nodes.push( node );
		}

		this.setMultipleSelection( nodes );
	},

	cloneSelectedInstance: function( skip_undo )
	{
		if(!this.selection_array || this.selection_array.length == 0)
			return;

		var result = [];

		for(var i = 0; i < this.selection_array.length; i++)
		{
			var selection = this.selection_array[i];

			//node
			if(selection.node && selection.node != LS.GlobalScene.root)
			{
				var new_node = EditorModule.cloneNode( selection.node, true, true );
				result.push(new_node);
				continue;
			}

			var scene = LS.GlobalScene;

			//root component
			if(selection.instance && selection.instance.constructor.is_component && selection.node == LS.GlobalScene.root) 
			{
				var component = selection.instance;
				new_component = component.clone();
				selection.node.addComponent( new_component );

				UndoModule.addUndoStep({ 
					data: { compo_uid: new_component._uid },
					callback_undo: function(d) {
						var compo = scene.root.getComponentByUid( d.compo_uid );
						if(!compo)
							return;
						d.old_compo = compo;
						scene.root.removeComponent(compo);
					},
					callback_redo: function(d) {
						var compo = d.old_compo;
						scene.root.addComponent(compo);
					}
				});

				result.push( new_component );
			}
		}

		if(!skip_undo)
		{
			var old_selection = this.getSelectionUIds();
			var created_uids = [];
			for(var i in result)
				created_uids.push( result[i].uid );
			//DELETE NODES
			UndoModule.addUndoStep({ 
				title: "Cloned " + (created_uids.length > 1 ? "nodes" : "node"),
				data: { uids: created_uids, old_selection: old_selection },
				callback_undo: function(d) {
					d.removed = [];
					for(var i in d.uids)
					{
						var uid = d.uids[i];
						var node = LS.GlobalScene.getNodeByUId(uid);
						if(node)
						{
							d.removed.push([ node.parentNode.uid, node ]);
							node.destroy();
						}
					}
					SelectionModule.setSelectionFromUIds( d.old_selection );
				},
				callback_redo: function(d)
				{
					for(var i in d.removed)
					{
						var n = d.removed[i];
						var node = LS.GlobalScene.getNode(n[0]);
						if(node)
							node.addChild( n[1] );
					}
					d.removed = null;
				}
			});
		}

		return result;
	},

	removeSelectedInstances: function()
	{
		if(!this.selection_array || this.selection_array.length == 0)
			return;

		var data_removed = [];
		var selection_array = this.selection_array.concat(); //clone because it will be modifyed when removing objects

		for(var i = 0; i < selection_array.length; i++)
		{
			var selection = selection_array[i];

			var node = selection.node;
			if(!node || !node.parentNode)
				continue;
	
			//remove node
			if( selection.instance.constructor === LS.SceneNode && !selection.instance._is_root )
			{
				data_removed.push( { parent_uid: node.parentNode.uid, index: node.parentNode.childNodes.indexOf( node ), node_data: node.serialize() } );
				node.parentNode.removeChild(node);
			} //removed component
			else if( selection.instance._root && selection.instance._root.constructor === LS.SceneNode )
			{
				data_removed.push( { node_uid: node.uid, comp_class: LS.getObjectClassName( selection.instance ), comp: selection.instance.serialize() } );
				node.removeComponent( selection.instance );
			}
		}

		if(!data_removed.length)
			return;

		//Create UNDO STEP 
		CORE.userAction("selection_removed", data_removed );

		EditorModule.inspect();
		SelectionModule.setSelection(null);
	},

	selectParentNode: function()
	{
		var node = this.getSelectedNode();
		if(!node)
			return;
		var selected = node.parentNode;
		if(selected)
			this.setSelection( selected );
	},

	selectChildNode: function()
	{
		var node = this.getSelectedNode();
		if(!node)
			return;
		var selected = node.childNodes[0] ;
		if(selected)
			this.setSelection( selected );
	},

	selectSiblingNode: function( previous )
	{
		var node = this.getSelectedNode();
		if(!node)
			return;
		var parent = node.parentNode;
		if(!parent)
			return;

		var children = parent._children;
		if( !children || !children.length )
			return;
		var index = children.indexOf( node );
		if(previous)
		{
			if(index == -1)
				return;
			index -= 1;
			if(index < 0)
				index = children.length - 1;
		}
		else
			index += 1;
		var selected = children[ index % children.length ];
		if(selected)
			this.setSelection( selected );
	},

	saveSelection: function()
	{
		var nodes = this.getSelectedNodes();
		var r = { 
			type: "selection",
			nodes: []
		};

		for(var i in nodes)
			r.nodes.push( nodes[i].uid );

		LiteGUI.toClipboard(r);
	},

	restoreSelection: function()
	{
		var r = LiteGUI.getLocalClipboard();
		//console.log(r);
		if(r && r.type == "selection")
			this.setSelectionFromUIds(r.nodes);
	}
};

CORE.registerModule( SelectionModule );