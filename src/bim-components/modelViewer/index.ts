import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front"
import * as THREE from 'three'
import { setUpTreeFromProperties } from "../../utilities/BuildingElementUtilities";
import { GetFragmentsFromExpressIds } from "../../utilities/IfcUtilities";
import { BuildingElement, KnowGroupType, knownProperties, SelectionGroup, VisibilityMode, VisibilityState } from "../../utilities/types";
import { Tree, TreeNode, TreeUtils } from "../../utilities/Tree";
import { _roots } from "@react-three/fiber";
import { ModelCache } from "../modelCache";

interface TreeContainer {
    id: string; // name of tree
    tree: Tree<BuildingElement>;
    visibilityMap: Map<string, VisibilityState>; // key = every node name, value = visibility mode
}


export class ModelViewManager extends OBC.Component {
    private _enabled = false;
    private _isSetup = false;
    static uuid = "0f5e514e-5c1c-4097-a9cc-6620c2e28378" as const;

    /**
     * Tree is a data structure we create similar to the file strucutre of an .ifc file though typicially we use element properties for robustness to determine groupings such as building steps and assembly
     * you can create a different tree strucutre and use it in other scenarios 
     */
    // private _tree?: Tree<BuildingElement>;
    private _tree?: TreeContainer;


    private _trees: Map<string, TreeContainer> = new Map();

    getViewTree(name: string): TreeContainer | undefined {
        if (!name) return;
        return this._trees.get(name);
    }

    /**
     * Add a new tree or replace an existing tree based on the name as a key in a map storing the view tree.
     * @returns 
     */
    addTree(treeID: string, tree: Tree<BuildingElement>, visibilityMap: Map<string, VisibilityState> | undefined = undefined) {
        const treeContainer = {
            id: treeID,
            tree: tree,
            visibilityMap: visibilityMap ?? this.createVisibilityMap(tree)
        }

        console.log('setting view Tree', treeID, visibilityMap, tree)
        this._trees.set(treeID, treeContainer);
        return treeContainer;
    }

    private createVisibilityMap(tree: Tree<BuildingElement>) {
        return tree.getNodes(node => node.type !== "BuildingElement").reduce((map, treeNode) => {
            map.set(treeNode.id, VisibilityState.Visible)
            return map;
        }, new Map<string, VisibilityState>());
    }

    /**
     * tree visibiliy is a map/dictionary of every node in a tree and stores the visibility state of eachnode. if a parent node is hidden this can be helpful to decide how to treat children nodes
     * you can create other visibility maps to suit other purposes such as materaial grouping
     */
    private _treeVisibility() {
        return this._tree?.visibilityMap;
    }

    /**
     * the selection group defines the group which is actively being used across the software and is typically a building step or station
     * it helps us determine whats important to show the user and whats next and before this group when changing.
     */
    private _selectedGroup?: SelectionGroup;

    /**
     * A collection of building elements that can be changed by other components to prevent specific elements from
     * showing during visibility update. it is the responsibility of the other component to also clear this collection.
     */
    private _additionalHiddenElements: Set<BuildingElement> = new Set();

    /**
     * A collection of building elements that can be changed by other components to prevent specific elements from
     * showing during visibility update. it is the responsibility of the other component to also clear this collection.
     */
    get ExludedElements(): Set<BuildingElement> {
        return this._additionalHiddenElements;
    }

    /**
     * A collection of building elements that can be changed by other components to prevent specific elements from
     * showing during visibility update. it is the responsibility of the other component to also clear this collection.
     */
    set ExludedElements(elementsToExclude: Set<BuildingElement>) {
        this._additionalHiddenElements = elementsToExclude;
    }

    readonly onTreeChanged = new OBC.Event<Tree<BuildingElement> | undefined>();
    readonly onBuildingElementsChanged = new OBC.Event<BuildingElement[]>();
    readonly onGroupVisibilitySet = new OBC.Event<{treeID: string, visibilityMap: Map<string, VisibilityState>}>();
    readonly onSelectedGroupChanged = new OBC.Event<SelectionGroup>();
    readonly onVisibilityModeChanged = new OBC.Event<VisibilityMode>();
    readonly onVisibilityUpdated = new OBC.Event<BuildingElement[]>();



    get SelectedGroup(): SelectionGroup | undefined {
        return this._selectedGroup;
    }
    set SelectedGroup(selectionGroup: SelectionGroup | undefined) {
        if (!selectionGroup) return;
        this._selectedGroup = selectionGroup;
        console.log("ModelViewManager: selected group changed:", selectionGroup)
        this.onSelectedGroupChanged.trigger(this._selectedGroup)

        // Add any additional logic needed when setting the selection group
    }

    get Tree(): Tree<BuildingElement> | undefined {
        return this._tree?.tree;
    }

    constructor(components: OBC.Components) {
        super(components);

        const frag = components.get(OBC.FragmentsManager)
        frag.onFragmentsDisposed.add((data) => this.cleanUp(data.groupID, data.fragmentIDs))
    }

    cleanUp = (groupID: string, fragmentIDs: string[]) => { }

    /**
     * search tree strucutre for a node with a name matching the groupID. 
     * @param groupId name of selection group to search tree
     * @returns undefined or a flat collection of children building elements.
     */
    getBuildingElements = (groupId: string, tree: Tree<BuildingElement>): BuildingElement[] | undefined => {
        if (!groupId || !tree) return;

        const groupNode = tree.getNode(groupId);

        if (!groupNode) return;

        return TreeUtils.getChildrenNonNullData(groupNode)
    }

    /**
     * Sets up Tree strucutre based on building elements properties and ignores the ifc file structure
     * 
     */
    setUpDefaultTree = (buildingElements: BuildingElement[] | undefined, groupVisibility?: Map<string, VisibilityState>): void => {
        if (!buildingElements) {
            this.onTreeChanged.trigger(undefined);
            return;
        }
        // const defaultTreeGrouping = ["Station", "BuildingStep"];
        const defaultTreeGrouping = [knownProperties.Assembly, knownProperties.BuildingStep];

        const tree = setUpTreeFromProperties("assembly", buildingElements, defaultTreeGrouping);

        console.log("tree created:", tree)
        this.addTree(tree.id,tree)
        this.setTree(tree.id)
        this._selectedGroup = undefined;
        this._enabled = true;
        this.updateVisibility(tree.id);
    }

    /**
     * Set which tree is the main tree for navigation and other features. you must first add
     * the tree using this.addTree. and then you can set it by using the tree name.
     * @param treeName the key to search existing trees
     */
    setTree(treeName: string): boolean {
        const newMainTree = this._trees.get(treeName)
        if(!newMainTree) {
            console.log('faile dto set tree as no tree exists with that name. try adding it first', treeName)
            return false;
        }

        this._tree = newMainTree;
        this.onTreeChanged.trigger(this._tree.tree);
        if(!this._tree.visibilityMap) return false;
        this.onGroupVisibilitySet.trigger({treeID: this._tree.id, visibilityMap: this._tree.visibilityMap});
        return true;
    }


    // private createDefaultTreeVisibility(): Map<string, VisibilityState> {
    //     if (!this._tree) throw new Error("Tree not initialized");
    //     const keys = Array.from(this._tree.getFlatTreeNodes()).filter(element => element.type !== "BuildingElement").flatMap(a => a.id);
    //     console.log("tree vis:", this._treeVisibility)
    //     return new Map(keys.map(name => [name, VisibilityState.Visible]));
    // }

    get GroupVisibility(): Map<string, VisibilityState> | undefined {
        return this._treeVisibility();
    }

    get enabled(): boolean {
        return this._enabled;
    }

    private _visibilityMode: VisibilityMode = VisibilityMode.Isolate;

    get VisibilityMode(): VisibilityMode {
        return this._visibilityMode;
    }

    /**
     * visibilityMode determines how selected and non selected groupings will be displayed upone next visibility update.
     */
    set VisibilityMode(value: VisibilityMode) {
        // console.log("Visibility mode set:", value)
        this._visibilityMode = value;
        this.onVisibilityModeChanged.trigger(this._visibilityMode);
    }

    /**
     * Group Visibility : key = group Name, value = visibility state. will be used to determine the visibility of geometry 
     * when triggering updateVisibility;
     */
    set GroupVisibility(value: Map<string, VisibilityState> | undefined) {
        // console.log("ModelViewManager: group vis being set", value);
        this._treeVisibility = value;
        this.onGroupVisibilitySet.trigger(this._treeVisibility);
        this.updateVisibility();
    }

    /**
     * displays all tree nodes before the selection group
     * @param group group to be made visible
     * @returns 
     */
    // SequentiallyVisible(group: SelectionGroup,tree: Tree<BuildingElement>) {
    //     if (!group.id || !tree) return;

    //     const node = tree.getNode(group.id);
    //     const sameNodeTypes = this._tree?.getNodes(n => n.type === node?.type)
    //     if (!sameNodeTypes) return;

    //     const visibleNodes: TreeNode<BuildingElement>[] = [];
    //     const hiddenNodes: TreeNode<BuildingElement>[] = [];
    //     let nodeFound = false;

    //     sameNodeTypes.forEach(otherNode => {
    //         if (nodeFound) {
    //             hiddenNodes.push(otherNode)
    //             return;
    //         }
    //         if (otherNode === node) {
    //             visibleNodes.push(otherNode)
    //             nodeFound = true;
    //             return;
    //         }
    //         visibleNodes.push(otherNode)
    //     });

    //     hiddenNodes.forEach(treeNode => {
    //         this.setVisibility(treeNode.id, VisibilityState.Hidden, false)
    //     });

    //     // make each node, their parent and children are visible
    //     visibleNodes.forEach(treeNode => {
    //         this.setVisibility(treeNode.id, VisibilityState.Visible, false)
    //         if (treeNode.parent)
    //             this.setVisibility(treeNode.parent.id, VisibilityState.Visible, false)

    //         node?.children.forEach(childNode => { this.setVisibility(childNode.id, VisibilityState.Visible, false) })
    //     });

    //     node?.children.forEach(childNode => { this.setVisibility(childNode.id, VisibilityState.Visible, false) })
    //     this.onGroupVisibilitySet.trigger(this._treeVisibility);
    //     this.updateVisibility();


    // }


    // private setVisibilityOfAllChildren() => {

    // }

    /**
     * Using thatOpen OBF.highlighter component to highlight by express ids using the select highlight type. clearing the
     * select highlight collection before making the new selection
     * @param group group to be selected
     * @returns 
     */
    async select(group: SelectionGroup, treeID: string) {
        if (!group.id || !this.components) return;
        console.log("high light these elements")

        const highlighter = this.components.get(OBF.Highlighter);
        const modelCache = this.components.get(ModelCache);

        const tree = this._trees.get(treeID);
        if(!tree) return;
        const node = tree.tree.getNode(group.id);
        if (!node) return;

        const buildingElements = TreeUtils.getChildren(node, n => n.data !== null && n.type === "BuildingElement");

        const elementsByModelId = new Map<string, BuildingElement[]>();
        for (const tNode of buildingElements) {
            const groupID = tNode.data?.modelID;
            if (!groupID || !tNode.data) continue;
            if (!elementsByModelId.has(groupID)) {
                elementsByModelId.set(groupID, []);
            }
            elementsByModelId.get(groupID)!.push(tNode.data);
        }

        await highlighter.clear('select');

        const highlightPromises = Array.from(elementsByModelId.entries()).map(async ([modelId, elements]) => {
            const model = modelCache.getModel(modelId);
            if (!model) return;

            const expressIds = elements.flatMap(e => e.expressID);
            const elementTypeIds = model.getFragmentMap(expressIds);
            console.log("high light these elements", elementTypeIds)
            await highlighter.highlightByID("select", elementTypeIds, false, false);
        });


        await Promise.all(highlightPromises);
    }


    /**
     * sets the view of the 3d elements based on the input viewmode and selection group. Note it clears the existing view tree
     * @param group group to be selected, if undefined will use the selection group of the View Manager if found
     * @param visibilityMode mode to be used, if undefined will use the visibilityMode of the View Manager if found
     * @returns 
     */
    updateBasedOnVisibilityMode(group: SelectionGroup | undefined, visibilityMode: VisibilityMode | undefined, treeID: string) {
        if (!group && this._selectedGroup) group = this._selectedGroup;
        if (!visibilityMode && this._visibilityMode) visibilityMode = this._visibilityMode;
        if (!group || !visibilityMode || !this._trees.has(treeID)) return;
        console.log('update visibility based on Mode', visibilityMode, group)

        const tree = this._trees.get(treeID);
        if(!tree) return;
        
        const node = tree.tree.getNode(group.id);
        // get all nodes of the same type as they will be the equal level in the tree 
        const sameNodeTypes = tree.tree.getNodes(n => n.type === node?.type)
        if (!node || !sameNodeTypes) return;

        // make parent visible // note: should be recursive in future
        if (node?.parent)
            this.setVisibility(node.parent.id, tree.tree.id,VisibilityState.Visible, false)

        // get visible and hidden nodes to later do the same for the children

        switch (visibilityMode) {
            case VisibilityMode.Isolate:
                // every other node except its parent and its self are hidden
                sameNodeTypes.forEach(treeNode => {
                    this.setVisibility(treeNode.id, tree.tree.id,treeNode.id === group?.id ? VisibilityState.Visible : VisibilityState.Hidden, false)
                });
                break;
            case VisibilityMode.selectGroup:
                // do nothing but select and make sure there visible

                break;
            case VisibilityMode.showPrevious:
                this.showNeighborNodes(tree.tree,node.id,true)
                break;
            case VisibilityMode.showNeighbors:
                //every node in its parent is visible, every thing else hidden
                this.showNeighborNodes(tree.tree,node.id,false)
                break;
        }

        // now go and make sure all children of vis are vis and that all parents are visible
        // make each node, their parent and children are visible

        this.onGroupVisibilitySet.trigger({treeID: tree.tree.id, visibilityMap: tree.visibilityMap});
        this.updateVisibility(tree.id);
    }

    /**
     * Search for neighbors of the same type and make all previous neighbors that share a same parent visible.
     * the rest make hidden. this works for any level of the tree.
     * @param tree 
     * @param nodeID 
     * @returns 
     */
    private showNeighborNodes = (tree: Tree<BuildingElement>, nodeID: string, showOnlyPrevious: boolean): boolean => {
        if(!tree) return false;
        const visibleNodes: TreeNode<BuildingElement>[] = [];
        const hiddenNodes: TreeNode<BuildingElement>[] = [];
        // every parent node and children before this parents node are hidden

        const node = tree?.getNode(nodeID);
        if (!node || !node.parent) return false; // its the root or cant be found
        console.log('Show previous Neighbors of:', node)

        const sameNodeTypes = tree?.getNodes(n => n.type === node?.type)
        if (!sameNodeTypes) return false;

        let nodeFound = false;

        sameNodeTypes.forEach(otherNode => {
            if (otherNode.parent === node.parent && !nodeFound) {
                visibleNodes.push(otherNode);
                if (otherNode === node) nodeFound = true;
            } else if (otherNode.parent === node.parent && !showOnlyPrevious){
                visibleNodes.push(otherNode)
            } else {
                hiddenNodes.push(otherNode)
            }
        });

        hiddenNodes.forEach(treeNode => {
            this.setVisibility(treeNode.id, tree.id, VisibilityState.Hidden, false)
        });
        console.log('all hidden nodes found:', hiddenNodes)

        // make each node, their parent and children are visible
        visibleNodes.forEach(treeNode => {
            this.setVisibility(treeNode.id, tree.id, VisibilityState.Visible, false)
            if (treeNode.parent)
                this.setVisibility(treeNode.parent.id, tree.id, VisibilityState.Visible, false)

            node?.children.forEach(childNode => { this.setVisibility(childNode.id, tree.id, VisibilityState.Visible, false) })
        });

        return true;
    }

    // private showPreviousTreeNodes = (tree: Tree<BuildingElement>, nodeID: string): boolean => {
    //     const visibleNodes: TreeNode<BuildingElement>[] = [];
    //     const hiddenNodes: TreeNode<BuildingElement>[] = [];
    //     // every parent node and children before this parents node are hidden

    //     const node = this._tree?.getNode(nodeID);
    //     if (!node || !node.parent) return false; // its the root or cant be found

    //     //let parents: TreeNode<BuildingElement>[] = [];

    //     //if(node.parent) parents.push(node.parent)
    //     //if(node.parent?.parent) parents.push(node.parent.parent)
    //     // make parent visible 

    //     const parents: TreeNode<BuildingElement>[] = [];
    //     let currentNode = node;
    //     while (currentNode.parent) {
    //         parents.unshift(currentNode.parent); // Add parent to the beginning of the array
    //         currentNode = currentNode.parent;
    //     }

    //     parents.forEach(parent => {
    //         const children = [...parent.children.values()].filter(child => !parents.includes(child));
    //         children.forEach(child => )

    //     });

    //     // Step 2: Traverse from highest parent to reference node
    //     for (let i = 0; i < parents.length; i++) {
    //         const parent = parents[i];
    //         const childToKeepVisible = i === parents.length - 1 ? node : parents[i + 1];

    //         // Hide all children except for the sub-parent or reference node
    //         for (const child of parent.children) {
    //             if (child !== childToKeepVisible) {
    //                 hiddenNodes.push(child)
    //             }
    //         }
    //     }
    // }








    isolate(group: SelectionGroup, treeID: string) {
        if (!group.id || !this._trees.has(treeID)) return;

        const tree = this._trees.get(treeID);
        if(!tree) return;

        const node = tree?.tree.getNode(group.id);
        const sameNodeTypes = tree?.tree.getNodes(n => n.type === node?.type)
        if (!sameNodeTypes) return;

        sameNodeTypes.forEach(treeNode => {
            this.setVisibility(treeNode.id,tree.id, treeNode.id === group.id ? VisibilityState.Visible : VisibilityState.Hidden, false)
        });

        // make parent visible // note: should be recursive in future
        if (node?.parent)
            this.setVisibility(node.parent.id,treeID, VisibilityState.Visible, false)

        console.log('geting children of isolated node', node?.children)
        node?.children.forEach(childNode => { this.setVisibility(childNode.id,treeID, VisibilityState.Visible, false) })
        this.onGroupVisibilitySet.trigger({treeID: treeID, visibilityMap: tree?.visibilityMap ?? new Map});
        this.updateVisibility(treeID);
    }

    /**
     * sets new value if key if found matching groupname. if update is true then 3d scene will update visibility based on change
     * @param nodeId 
     * @param state 
     * @param updateVisibility 
     * @returns 
     */
    setVisibility(nodeId: string,treeID: string, state: VisibilityState, updateVisibility: boolean = false) {

        if(!this._trees.has(treeID)) return;

        const visibilityMap = this._trees.get(treeID)?.visibilityMap;
        // if(!visibilityMap) return;
        

        if (!visibilityMap || !nodeId || !visibilityMap.has(nodeId)) {
            console.log("failed to change visibility,name not found:", nodeId, visibilityMap?.keys())
            return;
        }
        if (visibilityMap.get(nodeId) === state) {
            //console.log("failed to change visibility, state already the same:", this._treeVisibility.get(nodeId))
            return;
        }
        visibilityMap.set(nodeId, state);

        if (updateVisibility) this.updateVisibility(treeID);
    }

    private SetVisibility(fragments: OBC.FragmentsManager, elements: BuildingElement[] | undefined, visibility: VisibilityState): void {

        if (!elements) return;
        const elementsByModelId = this.groupElementsByModelId(elements);

        //const transWhite = this.white.multiplyScalar(10);
        fragments.groups.forEach(model => {
            const elementsForModel = elementsByModelId.get(model.uuid);
            if (elementsForModel) {
                const allFragments = GetFragmentsFromExpressIds(elementsForModel.map(element => element.expressID), fragments, model);
                if (visibility === VisibilityState.Visible) {
                    allFragments.forEach((ids, frag) => frag.setVisibility(true, ids));
                    // allFragments.forEach((ids, frag) => frag.resetColor(ids));
                }
                else {
                    allFragments.forEach((ids, frag) => frag.setVisibility(false, ids));
                    // allFragments.forEach((ids, frag) => frag.setColor(transWhite, ids));
                }
            }
        });
    }

    // if color = true color will be reset to original
    private SetColor(fragments: OBC.FragmentsManager, elements: BuildingElement[], color: boolean | THREE.Color = false): void {
        const elementsByModelId = this.groupElementsByModelId(elements);

        fragments.groups.forEach(model => {
            const elementsForModel = elementsByModelId.get(model.uuid);
            if (elementsForModel) {
                const allFragments = GetFragmentsFromExpressIds(elementsForModel.map(element => element.expressID), fragments, model);
                if (color === true)
                    allFragments.forEach((ids, frag) => frag.resetColor(ids));
                else if (color instanceof THREE.Color)
                    allFragments.forEach((ids, frag) => frag.setColor(color, ids));
            }
        });
    }

    private groupElementsByModelId(elements: BuildingElement[]): Map<string, BuildingElement[]> {
        return elements.reduce((acc, element) => {
            if (!acc.has(element.modelID)) {
                acc.set(element.modelID, []);
            }
            acc.get(element.modelID)!.push(element);
            return acc;
        }, new Map<string, BuildingElement[]>());
    }
    /**
     * Updates visibility of building elements based on selection groups and the Tree of building elements. call this if needing to 
     * manually refresh the visibility state.
     * @returns 
     */
    public updateVisibility = (treeID: string) => {
        if (!this._enabled || !this.components || !this._trees.has(treeID)) return;

        const treeContainer = this._trees.get(treeID)

        const fragments = this.components.get(OBC.FragmentsManager);
        if (!treeContainer?.visibilityMap) {
            const allElements = this.getAllElements();
            this.SetVisibility(fragments, allElements, VisibilityState.Visible);
            console.log("hide elements fails, showing all instead")
            this.onVisibilityUpdated.trigger(allElements);
            return;
        }

        const visibilityTypes = this.groupElementsByVisibilityState(treeContainer.tree,treeContainer.visibilityMap);
        if (visibilityTypes) {

            //remove hidden from visible group and add to hidden
            // const filterredVisibles = visibilityTypes?.get(VisibilityState.Visible)?.filter(element => !this._additionalHiddenElements.has(element))
            // if (filterredVisibles)
            //     visibilityTypes?.set(VisibilityState.Visible, filterredVisibles)
            // const newHidden = visibilityTypes?.get(VisibilityState.Hidden)?.filter(element => !this._additionalHiddenElements.has(element))
            // if (newHidden)
            //     visibilityTypes?.get(VisibilityState.Hidden)?.push(...newHidden)
            console.log("Visibility Update", visibilityTypes)
            this.SetVisibility(fragments, visibilityTypes.get(VisibilityState.Visible), VisibilityState.Visible);
            this.SetVisibility(fragments, visibilityTypes.get(VisibilityState.Hidden), VisibilityState.Hidden);
            this.SetVisibility(fragments, visibilityTypes.get(VisibilityState.Ghost), VisibilityState.Ghost);
            this.onVisibilityUpdated.trigger(visibilityTypes?.get(VisibilityState.Visible));
        }

    };

    private getAllElements(): BuildingElement[] | undefined {
        if (!this._tree?.tree.root.id) return;
        return this.getBuildingElements(this._tree?.tree.root.id,this._tree?.tree);
    }

    // search element tree and group building elements by visibility state of their highest parent node 
    private groupElementsByVisibilityState(tree: Tree<BuildingElement>, visibilityMap: Map<string,VisibilityState>): Map<VisibilityState, BuildingElement[]> | undefined {

        if (!tree || !visibilityMap) return undefined;

        // 1. if the parent node is hidden, all children nodes will be hidden
        // 2. if parent node is ghost, children node of type visible and ghost will be ghost, and hidden remains hidden
        // 3. if parent node is visble nothing changes 

        const result = new Map<VisibilityState, BuildingElement[]>();
        result.set(VisibilityState.Visible, []);
        result.set(VisibilityState.Hidden, []);
        result.set(VisibilityState.Ghost, []);
        console.log('nodeVisibilityState', visibilityMap)


        const traverseNode = (node: TreeNode<BuildingElement>, parentState: VisibilityState) => {

            if (!tree || !visibilityMap) return undefined;

            const nodeVisibility = visibilityMap.get(node.id) || parentState;

            if (node.isLeaf) {
                // This is a building element node
                switch (nodeVisibility) {
                    case VisibilityState.Hidden:
                        console.log("nodeVisibility Set to Hidden")
                        result.get(VisibilityState.Hidden)!.push(node.data!);
                        break;
                    case VisibilityState.Ghost:
                        result.get(VisibilityState.Ghost)!.push(node.data!);
                        break;
                    case VisibilityState.Visible:
                        result.get(VisibilityState.Visible)!.push(node.data!);
                        break;
                }
            } else if (nodeVisibility === VisibilityState.Hidden) {
                // if this container is hidden then everthing bellow it is also hidden
                const allBuildingElements = TreeUtils.getChildrenNonNullData(node);
                allBuildingElements.forEach(element => result.get(VisibilityState.Hidden)!.push(element));

            } else {
                // This is a container node, traverse its children
                node.children.forEach(child => {
                    let childState = nodeVisibility;
                    if (nodeVisibility === VisibilityState.Ghost &&
                        visibilityMap.get(child.id) === VisibilityState.Visible) {
                        childState = VisibilityState.Ghost;
                    }
                    traverseNode(child, childState);
                });
            }


        };

        // Start traversal from the root
        traverseNode(tree.root!, VisibilityState.Visible);
        // console.log("vis state grouped",result)
        console.log('nodeVisibilityState set', result)
        return result;
    }
}